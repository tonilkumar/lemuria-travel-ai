import type {
  AuthenticatedUser,
  CreateQuotationInput,
  QuotationListQuery,
  ServiceCategory,
  UpsertPackageInput,
  UpdateVersionContentInput,
} from '@lemuria/shared';
import {
  approvalTriggers,
  calculateCosting,
  isVersionEditable,
  PASS_THROUGH_CATEGORIES,
  sumCostings,
  type ApprovalRules,
  type TaxBasis,
} from '@lemuria/shared';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db, type Transaction } from '../../db/client.js';
import { users } from '../../db/schema/auth.js';
import { customers } from '../../db/schema/customers.js';
import { leads } from '../../db/schema/leads.js';
import { settings, taxRates } from '../../db/schema/masterdata.js';
import {
  quotationApprovals,
  quotationItems,
  quotationPackages,
  quotations,
  quotationVersions,
} from '../../db/schema/quotations.js';
import { recordAudit, type AuditContext } from '../../lib/audit.js';
import { nextCode } from '../../lib/codes.js';
import { badRequest, forbidden, invalidTransition, notFound } from '../../lib/errors.js';

/** Rupees from the client become paise the moment they cross the boundary. */
const toPaise = (rupees: number): number => Math.round(rupees * 100);

const SORTABLE = {
  createdAt: quotations.createdAt,
  updatedAt: quotations.updatedAt,
  title: quotations.title,
  status: quotations.status,
} as const;

const asArray = <T>(v: T | T[] | undefined): T[] | undefined =>
  v === undefined ? undefined : Array.isArray(v) ? v : [v];

/**
 * Approval thresholds, read from settings.
 *
 * Lemuria has not set these yet. Until they do, the only rule that fires is the
 * unconditional loss-making one — the system does not invent a value threshold
 * and then block quotations against a number nobody agreed to.
 */
export async function approvalRules(): Promise<ApprovalRules> {
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, ['quotation.highValueThresholdPaise', 'quotation.minimumMarginBps']));

  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const num = (key: string): number | null => {
    const raw = byKey.get(key);
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  };

  return {
    highValueThresholdPaise: num('quotation.highValueThresholdPaise'),
    minimumMarginBps: num('quotation.minimumMarginBps'),
  };
}

/**
 * Resolves the tax treatment for a package.
 *
 * Uses the explicitly chosen rate when there is one, otherwise the configured
 * rate for the category carrying the most cost — the package's dominant
 * service. Falls back to EXEMPT rather than guessing a percentage: charging a
 * made-up rate is worse than charging none and having the omission noticed.
 */
async function resolveTaxRate(
  tx: Transaction | typeof db,
  explicitRateId: string | undefined,
  items: UpsertPackageInput['items'],
): Promise<{ id: string | null; rateBps: number; basis: TaxBasis; isProvisional: boolean }> {
  if (explicitRateId) {
    const [row] = await tx
      .select()
      .from(taxRates)
      .where(and(eq(taxRates.id, explicitRateId), isNull(taxRates.deletedAt)))
      .limit(1);
    if (!row) throw badRequest('That tax rate no longer exists.');
    return {
      id: row.id,
      rateBps: row.rateBps,
      basis: row.basis as TaxBasis,
      isProvisional: row.isProvisional,
    };
  }

  const costByCategory = new Map<string, number>();
  for (const item of items) {
    const value = toPaise(item.unitCost) * item.quantity;
    costByCategory.set(item.category, (costByCategory.get(item.category) ?? 0) + value);
  }

  const dominant = [...costByCategory.entries()].sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'MISC';

  const [row] = await tx
    .select()
    .from(taxRates)
    .where(
      and(
        eq(taxRates.serviceCategory, dominant),
        eq(taxRates.isActive, true),
        isNull(taxRates.deletedAt),
      ),
    )
    .orderBy(desc(taxRates.effectiveFrom))
    .limit(1);

  if (!row) return { id: null, rateBps: 0, basis: 'EXEMPT', isProvisional: true };

  return {
    id: row.id,
    rateBps: row.rateBps,
    basis: row.basis as TaxBasis,
    isProvisional: row.isProvisional,
  };
}

/**
 * Recomputes a version from its packages and their lines.
 *
 * The single place any monetary figure is written. Called after every edit, so
 * stored totals always reconcile with the lines beneath them — there is no path
 * that writes a price the engine did not produce.
 */
export async function recalculateVersion(
  tx: Transaction | typeof db,
  versionId: string,
  rules: ApprovalRules,
): Promise<void> {
  const packages = await tx
    .select()
    .from(quotationPackages)
    .where(eq(quotationPackages.versionId, versionId))
    .orderBy(asc(quotationPackages.sortOrder));

  const results = [];

  for (const pkg of packages) {
    const items = await tx
      .select()
      .from(quotationItems)
      .where(eq(quotationItems.packageId, pkg.id));

    // Pass-through lines carry no markup, so they are held out of the markup
    // base and added back as "other cost".
    let markupBase = 0;
    let passThrough = 0;
    for (const item of items) {
      if (PASS_THROUGH_CATEGORIES.includes(item.category as ServiceCategory)) {
        passThrough += item.totalCost;
      } else {
        markupBase += item.totalCost;
      }
    }

    const costing = calculateCosting({
      supplierCostPaise: markupBase,
      otherCostPaise: passThrough,
      markupBps: pkg.markupBps,
      markupOverridePaise: pkg.markupOverride ?? undefined,
      discountBps: pkg.discountBps,
      discountOverridePaise: pkg.discountOverride ?? undefined,
      gstBps: pkg.gstBps,
      taxBasis: pkg.taxBasis as TaxBasis,
      travellerCount: pkg.travellerCount,
    });

    await tx
      .update(quotationPackages)
      .set({
        supplierCost: costing.supplierCost,
        otherCost: costing.otherCost,
        baseCost: costing.baseCost,
        markupAmount: costing.markupAmount,
        discountAmount: costing.discountAmount,
        netBeforeTax: costing.netBeforeTax,
        taxableValue: costing.taxableValue,
        gstAmount: costing.gstAmount,
        sellingPrice: costing.sellingPrice,
        marginAmount: costing.marginAmount,
        marginBps: costing.marginBps,
        perPersonPrice: costing.perPerson,
      })
      .where(eq(quotationPackages.id, pkg.id));

    results.push(costing);
  }

  const totals = sumCostings(results);
  const triggers = approvalTriggers(totals, rules);
  const provisional = packages.some((p) => p.taxIsProvisional);

  await tx
    .update(quotationVersions)
    .set({
      totalSupplierCost: totals.supplierCost,
      totalOtherCost: totals.otherCost,
      totalMarkup: totals.markupAmount,
      totalDiscount: totals.discountAmount,
      totalNetBeforeTax: totals.netBeforeTax,
      totalTaxable: totals.taxableValue,
      totalGst: totals.gstAmount,
      totalSellingPrice: totals.sellingPrice,
      marginAmount: totals.marginAmount,
      marginBps: totals.marginBps,
      approvalTriggers: triggers,
      taxIsProvisional: provisional,
    })
    .where(eq(quotationVersions.id, versionId));
}

export async function listQuotations(query: QuotationListQuery, viewer: AuthenticatedUser) {
  const conditions = [isNull(quotations.deletedAt)];

  if (query.mine) conditions.push(eq(quotations.ownerId, viewer.id));
  else if (query.ownerId) conditions.push(eq(quotations.ownerId, query.ownerId));

  if (query.customerId) conditions.push(eq(quotations.customerId, query.customerId));
  if (query.leadId) conditions.push(eq(quotations.leadId, query.leadId));

  const statuses = asArray(query.status);
  if (statuses?.length) conditions.push(inArray(quotations.status, statuses));

  if (query.awaitingApproval) conditions.push(eq(quotations.status, 'PENDING_APPROVAL'));

  if (query.createdFrom) conditions.push(gte(quotations.createdAt, sql`${query.createdFrom}::date`));
  if (query.createdTo) {
    conditions.push(lte(quotations.createdAt, sql`${query.createdTo}::date + interval '1 day'`));
  }

  if (query.search) {
    const term = `%${query.search.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    conditions.push(
      or(
        ilike(quotations.title, term),
        ilike(quotations.quotationCode, term),
        ilike(quotations.destination, term),
      ) ?? sql`true`,
    );
  }

  const where = and(...conditions);
  const sortColumn = SORTABLE[query.sortBy as keyof typeof SORTABLE] ?? quotations.createdAt;
  const direction = query.sortDir === 'asc' ? asc : desc;

  const canSeeMargin = viewer.permissions.includes('quotation.view_margin');

  const rows = await db
    .select({
      id: quotations.id,
      quotationCode: quotations.quotationCode,
      title: quotations.title,
      destination: quotations.destination,
      status: quotations.status,
      travelStartDate: quotations.travelStartDate,
      validUntil: quotations.validUntil,
      createdAt: quotations.createdAt,
      customer: {
        id: customers.id,
        fullName: customers.fullName,
        customerCode: customers.customerCode,
      },
      owner: { id: users.id, fullName: users.fullName, avatarUrl: users.avatarUrl },
      currentVersion: {
        id: quotationVersions.id,
        versionNumber: quotationVersions.versionNumber,
        totalSellingPrice: quotationVersions.totalSellingPrice,
        // Margin is commercially sensitive; an executive sees the price only.
        marginBps: canSeeMargin ? quotationVersions.marginBps : sql<number | null>`null`,
        marginAmount: canSeeMargin ? quotationVersions.marginAmount : sql<number | null>`null`,
        approvalTriggers: quotationVersions.approvalTriggers,
        taxIsProvisional: quotationVersions.taxIsProvisional,
      },
    })
    .from(quotations)
    .leftJoin(customers, eq(customers.id, quotations.customerId))
    .leftJoin(users, eq(users.id, quotations.ownerId))
    .leftJoin(quotationVersions, eq(quotationVersions.id, quotations.currentVersionId))
    .where(where)
    .orderBy(direction(sortColumn), desc(quotations.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: count() })
    .from(quotations)
    .where(where);

  return { rows, total };
}

export async function quotationSummary(viewer: AuthenticatedUser) {
  const [row] = await db
    .select({
      total: count(),
      draft: sql<number>`count(*) filter (where ${quotations.status} = 'DRAFT')::int`,
      pending: sql<number>`count(*) filter (where ${quotations.status} = 'PENDING_APPROVAL')::int`,
      sent: sql<number>`count(*) filter (where ${quotations.status} = 'SENT')::int`,
      accepted: sql<number>`count(*) filter (where ${quotations.status} = 'ACCEPTED')::int`,
      declined: sql<number>`count(*) filter (where ${quotations.status} = 'DECLINED')::int`,
    })
    .from(quotations)
    .where(
      and(
        isNull(quotations.deletedAt),
        viewer.permissions.includes('lead.read.all') ? undefined : eq(quotations.ownerId, viewer.id),
      ),
    );

  return row ?? { total: 0, draft: 0, pending: 0, sent: 0, accepted: 0, declined: 0 };
}

/** Full quotation with its current version, packages, lines and approvals. */
export async function getQuotation(id: string, viewer: AuthenticatedUser) {
  const [head] = await db
    .select({
      quotation: quotations,
      customer: {
        id: customers.id,
        customerCode: customers.customerCode,
        fullName: customers.fullName,
        primaryPhone: customers.primaryPhone,
        email: customers.email,
        tier: customers.tier,
      },
      lead: { id: leads.id, leadCode: leads.leadCode },
      owner: { id: users.id, fullName: users.fullName, avatarUrl: users.avatarUrl },
    })
    .from(quotations)
    .leftJoin(customers, eq(customers.id, quotations.customerId))
    .leftJoin(leads, eq(leads.id, quotations.leadId))
    .leftJoin(users, eq(users.id, quotations.ownerId))
    .where(and(eq(quotations.id, id), isNull(quotations.deletedAt)))
    .limit(1);

  if (!head) throw notFound('Quotation');

  const canSeeMargin = viewer.permissions.includes('quotation.view_margin');

  const versions = await db
    .select()
    .from(quotationVersions)
    .where(eq(quotationVersions.quotationId, id))
    .orderBy(desc(quotationVersions.versionNumber));

  const currentVersion =
    versions.find((v) => v.id === head.quotation.currentVersionId) ?? versions[0] ?? null;

  const packages = currentVersion
    ? await db
        .select()
        .from(quotationPackages)
        .where(eq(quotationPackages.versionId, currentVersion.id))
        .orderBy(asc(quotationPackages.sortOrder))
    : [];

  const items = packages.length
    ? await db
        .select()
        .from(quotationItems)
        .where(
          inArray(
            quotationItems.packageId,
            packages.map((p) => p.id),
          ),
        )
        .orderBy(asc(quotationItems.sortOrder))
    : [];

  const approvals = currentVersion
    ? await db
        .select({
          id: quotationApprovals.id,
          decision: quotationApprovals.decision,
          triggerReason: quotationApprovals.triggerReason,
          comments: quotationApprovals.comments,
          decidedAt: quotationApprovals.decidedAt,
          createdAt: quotationApprovals.createdAt,
          requestedBy: users.fullName,
        })
        .from(quotationApprovals)
        .leftJoin(users, eq(users.id, quotationApprovals.requestedById))
        .where(eq(quotationApprovals.versionId, currentVersion.id))
        .orderBy(desc(quotationApprovals.createdAt))
    : [];

  /** Strips cost and margin from anything an executive should not see. */
  const redactPackage = (p: (typeof packages)[number]) =>
    canSeeMargin
      ? p
      : {
          ...p,
          supplierCost: null,
          otherCost: null,
          baseCost: null,
          markupBps: null,
          markupOverride: null,
          markupAmount: null,
          marginAmount: null,
          marginBps: null,
        };

  return {
    ...head,
    versions: versions.map((v) =>
      canSeeMargin
        ? v
        : { ...v, totalSupplierCost: null, totalMarkup: null, marginAmount: null, marginBps: null },
    ),
    currentVersion: currentVersion
      ? canSeeMargin
        ? currentVersion
        : {
            ...currentVersion,
            totalSupplierCost: null,
            totalMarkup: null,
            marginAmount: null,
            marginBps: null,
          }
      : null,
    packages: packages.map(redactPackage),
    items: canSeeMargin ? items : items.map((i) => ({ ...i, unitCost: null, totalCost: null })),
    approvals,
    canSeeMargin,
  };
}

export async function createQuotation(
  input: CreateQuotationInput,
  viewer: AuthenticatedUser,
  ctx: AuditContext,
) {
  const [customer] = await db
    .select({ id: customers.id, name: customers.fullName })
    .from(customers)
    .where(and(eq(customers.id, input.customerId), isNull(customers.deletedAt)))
    .limit(1);

  if (!customer) throw badRequest('That customer no longer exists.');

  if (input.travelStartDate && input.travelEndDate && input.travelEndDate < input.travelStartDate) {
    throw badRequest('The return date cannot be before the departure date.');
  }

  return db.transaction(async (tx) => {
    const quotationCode = await nextCode(tx, 'QUOTATION');

    const [created] = await tx
      .insert(quotations)
      .values({
        quotationCode,
        customerId: input.customerId,
        leadId: input.leadId ?? null,
        title: input.title.trim(),
        destination: input.destination ?? null,
        travelStartDate: input.travelStartDate ?? null,
        travelEndDate: input.travelEndDate ?? null,
        travellersAdults: input.travellersAdults,
        travellersChildren: input.travellersChildren,
        validUntil: input.validUntil ?? null,
        status: 'DRAFT',
        ownerId: input.ownerId ?? viewer.id,
        createdById: viewer.id,
      })
      .returning();

    if (!created) throw new Error('Quotation insert returned no row');

    const [version] = await tx
      .insert(quotationVersions)
      .values({ quotationId: created.id, versionNumber: 1, status: 'DRAFT', createdById: viewer.id })
      .returning();

    if (!version) throw new Error('Version insert returned no row');

    await tx
      .update(quotations)
      .set({ currentVersionId: version.id })
      .where(eq(quotations.id, created.id));

    await recordAudit(
      {
        ...ctx,
        action: 'quotation.created',
        entityType: 'quotation',
        entityId: created.id,
        entityCode: created.quotationCode,
        after: { title: created.title, customer: customer.name },
        summary: `Quotation ${created.quotationCode} created for ${customer.name}`,
      },
      tx,
    );

    return { ...created, currentVersionId: version.id };
  });
}

/**
 * Starts a new version by cloning the current one.
 *
 * Editing a sent quotation is not allowed — the customer has seen those numbers.
 * V2 is how a price changes, and both versions stay on the record.
 */
export async function createVersion(
  quotationId: string,
  viewer: AuthenticatedUser,
  ctx: AuditContext,
) {
  const [quotation] = await db
    .select()
    .from(quotations)
    .where(and(eq(quotations.id, quotationId), isNull(quotations.deletedAt)))
    .limit(1);

  if (!quotation) throw notFound('Quotation');

  const rules = await approvalRules();

  return db.transaction(async (tx) => {
    const [latest] = await tx
      .select()
      .from(quotationVersions)
      .where(eq(quotationVersions.quotationId, quotationId))
      .orderBy(desc(quotationVersions.versionNumber))
      .limit(1);

    const nextNumber = (latest?.versionNumber ?? 0) + 1;

    const [version] = await tx
      .insert(quotationVersions)
      .values({
        quotationId,
        versionNumber: nextNumber,
        status: 'DRAFT',
        introText: latest?.introText ?? null,
        inclusions: latest?.inclusions ?? [],
        exclusions: latest?.exclusions ?? [],
        termsText: latest?.termsText ?? null,
        createdById: viewer.id,
      })
      .returning();

    if (!version) throw new Error('Version insert returned no row');

    // Deep-copy packages and their lines so V2 starts from V1 rather than blank.
    if (latest) {
      const sourcePackages = await tx
        .select()
        .from(quotationPackages)
        .where(eq(quotationPackages.versionId, latest.id))
        .orderBy(asc(quotationPackages.sortOrder));

      for (const source of sourcePackages) {
        const [copy] = await tx
          .insert(quotationPackages)
          .values({
            versionId: version.id,
            name: source.name,
            description: source.description,
            isRecommended: source.isRecommended,
            sortOrder: source.sortOrder,
            markupBps: source.markupBps,
            markupOverride: source.markupOverride,
            discountBps: source.discountBps,
            discountOverride: source.discountOverride,
            discountReason: source.discountReason,
            taxRateId: source.taxRateId,
            gstBps: source.gstBps,
            taxBasis: source.taxBasis,
            taxIsProvisional: source.taxIsProvisional,
            travellerCount: source.travellerCount,
          })
          .returning({ id: quotationPackages.id });

        if (!copy) continue;

        const sourceItems = await tx
          .select()
          .from(quotationItems)
          .where(eq(quotationItems.packageId, source.id));

        if (sourceItems.length) {
          await tx.insert(quotationItems).values(
            sourceItems.map((i) => ({
              packageId: copy.id,
              category: i.category,
              description: i.description,
              supplierId: i.supplierId,
              quantity: i.quantity,
              unitCost: i.unitCost,
              totalCost: i.totalCost,
              dayNumber: i.dayNumber,
              sortOrder: i.sortOrder,
            })),
          );
        }
      }
    }

    await recalculateVersion(tx, version.id, rules);

    await tx
      .update(quotations)
      .set({ currentVersionId: version.id, status: 'DRAFT' })
      .where(eq(quotations.id, quotationId));

    await recordAudit(
      {
        ...ctx,
        action: 'quotation.version_created',
        entityType: 'quotation',
        entityId: quotationId,
        entityCode: quotation.quotationCode,
        after: { versionNumber: nextNumber },
        summary: `Version ${nextNumber} started from V${latest?.versionNumber ?? 0}`,
      },
      tx,
    );

    return version;
  });
}

async function loadEditableVersion(tx: Transaction | typeof db, versionId: string) {
  const [version] = await tx
    .select()
    .from(quotationVersions)
    .where(eq(quotationVersions.id, versionId))
    .limit(1);

  if (!version) throw notFound('Quotation version');
  if (!isVersionEditable(version.status)) {
    throw invalidTransition(
      `Version ${version.versionNumber} is ${version.status.toLowerCase().replace(/_/g, ' ')} and cannot be edited. Start a new version to change the price.`,
      { status: version.status },
    );
  }
  return version;
}

export async function upsertPackage(
  versionId: string,
  input: UpsertPackageInput,
  viewer: AuthenticatedUser,
  ctx: AuditContext,
) {
  const rules = await approvalRules();

  return db.transaction(async (tx) => {
    await loadEditableVersion(tx, versionId);

    // Discounting is a margin decision, so it needs the margin permission.
    const discounting = input.discountBps > 0 || input.discountOverride !== undefined;
    if (discounting && !viewer.permissions.includes('quotation.view_margin')) {
      throw forbidden('Discounts need manager approval to apply.');
    }

    const tax = await resolveTaxRate(tx, input.taxRateId, input.items);

    const values = {
      versionId,
      name: input.name.trim(),
      description: input.description ?? null,
      isRecommended: input.isRecommended,
      sortOrder: input.sortOrder,
      markupBps: input.markupBps,
      markupOverride: input.markupOverride !== undefined ? toPaise(input.markupOverride) : null,
      discountBps: input.discountBps,
      discountOverride:
        input.discountOverride !== undefined ? toPaise(input.discountOverride) : null,
      discountReason: input.discountReason ?? null,
      taxRateId: tax.id,
      gstBps: tax.rateBps,
      taxBasis: tax.basis,
      taxIsProvisional: tax.isProvisional,
      travellerCount: input.travellerCount,
    };

    let packageId: string;

    if (input.id) {
      const [existing] = await tx
        .select({ id: quotationPackages.id, versionId: quotationPackages.versionId })
        .from(quotationPackages)
        .where(eq(quotationPackages.id, input.id))
        .limit(1);

      if (!existing || existing.versionId !== versionId) throw notFound('Package');

      await tx.update(quotationPackages).set(values).where(eq(quotationPackages.id, input.id));
      await tx.delete(quotationItems).where(eq(quotationItems.packageId, input.id));
      packageId = input.id;
    } else {
      const [created] = await tx
        .insert(quotationPackages)
        .values(values)
        .returning({ id: quotationPackages.id });
      if (!created) throw new Error('Package insert returned no row');
      packageId = created.id;
    }

    if (input.items.length) {
      await tx.insert(quotationItems).values(
        input.items.map((item, index) => {
          const unitCost = toPaise(item.unitCost);
          return {
            packageId,
            category: item.category,
            description: item.description.trim(),
            supplierId: item.supplierId ?? null,
            quantity: item.quantity,
            unitCost,
            totalCost: unitCost * item.quantity,
            dayNumber: item.dayNumber ?? null,
            sortOrder: item.sortOrder || index,
          };
        }),
      );
    }

    await recalculateVersion(tx, versionId, rules);

    await recordAudit(
      {
        ...ctx,
        action: input.id ? 'quotation.package_updated' : 'quotation.package_added',
        entityType: 'quotation_version',
        entityId: versionId,
        after: { package: values.name, items: input.items.length },
        summary: `Package "${values.name}" ${input.id ? 'updated' : 'added'}`,
      },
      tx,
    );

    return { packageId };
  });
}

export async function deletePackage(
  versionId: string,
  packageId: string,
  ctx: AuditContext,
): Promise<void> {
  const rules = await approvalRules();

  await db.transaction(async (tx) => {
    await loadEditableVersion(tx, versionId);

    const [removed] = await tx
      .delete(quotationPackages)
      .where(and(eq(quotationPackages.id, packageId), eq(quotationPackages.versionId, versionId)))
      .returning({ name: quotationPackages.name });

    if (!removed) throw notFound('Package');

    await recalculateVersion(tx, versionId, rules);

    await recordAudit(
      {
        ...ctx,
        action: 'quotation.package_removed',
        entityType: 'quotation_version',
        entityId: versionId,
        before: { package: removed.name },
        summary: `Package "${removed.name}" removed`,
      },
      tx,
    );
  });
}

export async function updateVersionContent(
  versionId: string,
  input: UpdateVersionContentInput,
  ctx: AuditContext,
) {
  return db.transaction(async (tx) => {
    await loadEditableVersion(tx, versionId);

    const [updated] = await tx
      .update(quotationVersions)
      .set({
        ...(input.introText !== undefined ? { introText: input.introText } : {}),
        ...(input.inclusions !== undefined ? { inclusions: input.inclusions } : {}),
        ...(input.exclusions !== undefined ? { exclusions: input.exclusions } : {}),
        ...(input.termsText !== undefined ? { termsText: input.termsText } : {}),
      })
      .where(eq(quotationVersions.id, versionId))
      .returning();

    await recordAudit(
      {
        ...ctx,
        action: 'quotation.content_updated',
        entityType: 'quotation_version',
        entityId: versionId,
        summary: 'Quotation copy edited',
      },
      tx,
    );

    return updated;
  });
}
