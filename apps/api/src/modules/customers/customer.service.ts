import type {
  AuthenticatedUser,
  CreateCustomerInput,
  CustomerListQuery,
  CustomerPreferencesInput,
  PassportInput,
  UpdateCustomerInput,
} from '@lemuria/shared';
import { customerStanding } from '@lemuria/shared';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { users } from '../../db/schema/auth.js';
import {
  customerGroupMembers,
  customerGroups,
  customerPreferences,
  customers,
} from '../../db/schema/customers.js';
import { documents } from '../../db/schema/documents.js';
import { bookings, payments } from '../../db/schema/finance.js';
import { followups, leads, notes } from '../../db/schema/leads.js';
import { customerPassports, visaCases } from '../../db/schema/visa.js';
import { visaCountries } from '../../db/schema/masterdata.js';
import { recordAudit, type AuditContext } from '../../lib/audit.js';
import { maskIdNumber, nextCode, normaliseName, normalisePhone } from '../../lib/codes.js';
import { badRequest, duplicateDetected, notFound } from '../../lib/errors.js';
import { fingerprint } from '../../lib/security.js';
import { findDuplicates } from '../leads/duplicate.service.js';

const SORTABLE = {
  createdAt: customers.createdAt,
  updatedAt: customers.updatedAt,
  fullName: customers.fullName,
  tier: customers.tier,
  relationshipScore: customers.relationshipScore,
  totalBookings: customers.totalBookings,
  lastActivityAt: customers.lastActivityAt,
} as const;

const asArray = <T>(v: T | T[] | undefined): T[] | undefined =>
  v === undefined ? undefined : Array.isArray(v) ? v : [v];

function buildCustomerFilters(query: CustomerListQuery, viewer: AuthenticatedUser) {
  const conditions = [isNull(customers.deletedAt)];

  // Customers are shared across the company; `mine` is a preference, not a wall.
  if (query.mine) conditions.push(eq(customers.ownerId, viewer.id));
  else if (query.ownerId) conditions.push(eq(customers.ownerId, query.ownerId));

  const tiers = asArray(query.tier);
  if (tiers?.length) conditions.push(inArray(customers.tier, tiers));

  if (query.isActive !== undefined) conditions.push(eq(customers.isActive, query.isActive));
  if (query.repeatOnly) conditions.push(sql`${customers.totalBookings} > 1`);

  if (query.createdFrom) conditions.push(gte(customers.createdAt, sql`${query.createdFrom}::date`));
  if (query.createdTo) {
    conditions.push(lte(customers.createdAt, sql`${query.createdTo}::date + interval '1 day'`));
  }

  if (query.passportExpiringInDays !== undefined) {
    conditions.push(sql`exists (
      select 1 from ${customerPassports} p
      where p.customer_id = ${customers.id}
        and p.deleted_at is null
        and p.expires_on between current_date and current_date + ${query.passportExpiringInDays}::int
    )`);
  }

  if (query.search) {
    const term = `%${query.search.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const digits = normalisePhone(query.search);
    conditions.push(
      or(
        ilike(customers.fullName, term),
        ilike(customers.customerCode, term),
        ilike(customers.email, term),
        ilike(customers.city, term),
        digits.length >= 4 ? ilike(customers.primaryPhone, `%${digits}%`) : sql`false`,
      ) ?? sql`true`,
    );
  }

  return and(...conditions);
}

export async function listCustomers(query: CustomerListQuery, viewer: AuthenticatedUser) {
  const where = buildCustomerFilters(query, viewer);
  const sortColumn = SORTABLE[query.sortBy as keyof typeof SORTABLE] ?? customers.createdAt;
  const direction = query.sortDir === 'asc' ? asc : desc;

  const rows = await db
    .select({
      id: customers.id,
      customerCode: customers.customerCode,
      fullName: customers.fullName,
      primaryPhone: customers.primaryPhone,
      email: customers.email,
      city: customers.city,
      tier: customers.tier,
      relationshipScore: customers.relationshipScore,
      totalBookings: customers.totalBookings,
      lastActivityAt: customers.lastActivityAt,
      isActive: customers.isActive,
      createdAt: customers.createdAt,
      owner: { id: users.id, fullName: users.fullName, avatarUrl: users.avatarUrl },
      // Surfaced in the list so an expiring passport is visible without opening
      // the record — it is the single most common reason to contact someone.
      passportExpiresOn: sql<string | null>`(
        select min(p.expires_on) from ${customerPassports} p
        where p.customer_id = ${customers.id} and p.deleted_at is null
      )`,
    })
    .from(customers)
    .leftJoin(users, eq(users.id, customers.ownerId))
    .where(where)
    .orderBy(direction(sortColumn), desc(customers.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: count() })
    .from(customers)
    .where(where);

  return { rows, total };
}

export async function customerSummary(query: CustomerListQuery, viewer: AuthenticatedUser) {
  const base = buildCustomerFilters({ ...query, tier: undefined }, viewer);

  const [row] = await db
    .select({
      total: count(),
      active: sql<number>`count(*) filter (where ${customers.isActive})::int`,
      repeat: sql<number>`count(*) filter (where ${customers.totalBookings} > 1)::int`,
      platinum: sql<number>`count(*) filter (where ${customers.tier} = 'PLATINUM')::int`,
      gold: sql<number>`count(*) filter (where ${customers.tier} = 'GOLD')::int`,
      silver: sql<number>`count(*) filter (where ${customers.tier} = 'SILVER')::int`,
      bronze: sql<number>`count(*) filter (where ${customers.tier} = 'BRONZE')::int`,
    })
    .from(customers)
    .where(base);

  return row ?? { total: 0, active: 0, repeat: 0, platinum: 0, gold: 0, silver: 0, bronze: 0 };
}

/**
 * The 360 view.
 *
 * Assembled from parallel queries rather than one wide join: a customer with
 * twelve bookings and forty documents would otherwise multiply into hundreds of
 * duplicated rows that the application then has to de-fan in memory.
 */
export async function getCustomer(id: string, viewer: AuthenticatedUser) {
  const [profile] = await db
    .select({
      customer: customers,
      owner: {
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(customers)
    .leftJoin(users, eq(users.id, customers.ownerId))
    .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
    .limit(1);

  if (!profile) throw notFound('Customer');

  const canSeeSensitive = viewer.permissions.includes('document.read.sensitive');

  const [
    preferences,
    passports,
    customerLeads,
    customerBookings,
    paymentTotals,
    customerDocuments,
    customerVisaCases,
    groupMembers,
  ] = await Promise.all([
    db.select().from(customerPreferences).where(eq(customerPreferences.customerId, id)).limit(1),

    db
      .select({
        id: customerPassports.id,
        passportNumberMasked: customerPassports.passportNumberMasked,
        fullNameOnPassport: customerPassports.fullNameOnPassport,
        nationality: customerPassports.nationality,
        issuedOn: customerPassports.issuedOn,
        expiresOn: customerPassports.expiresOn,
        placeOfIssue: customerPassports.placeOfIssue,
        isPrimary: customerPassports.isPrimary,
        documentId: customerPassports.documentId,
        daysToExpiry: sql<number | null>`(${customerPassports.expiresOn} - current_date)::int`,
      })
      .from(customerPassports)
      .where(and(eq(customerPassports.customerId, id), isNull(customerPassports.deletedAt)))
      .orderBy(desc(customerPassports.isPrimary), asc(customerPassports.expiresOn)),

    db
      .select({
        id: leads.id,
        leadCode: leads.leadCode,
        destination: leads.destination,
        travelDate: leads.travelDate,
        status: leads.status,
        classification: leads.classification,
        score: leads.score,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .where(and(eq(leads.customerId, id), isNull(leads.deletedAt)))
      .orderBy(desc(leads.createdAt))
      .limit(25),

    db
      .select({
        id: bookings.id,
        bookingCode: bookings.bookingCode,
        status: bookings.status,
        travelStartDate: bookings.travelStartDate,
        travelEndDate: bookings.travelEndDate,
        totalAmount: bookings.totalAmount,
        amountReceived: bookings.amountReceived,
        amountOutstanding: bookings.amountOutstanding,
        confirmedAt: bookings.confirmedAt,
      })
      .from(bookings)
      .where(and(eq(bookings.customerId, id), isNull(bookings.deletedAt)))
      .orderBy(desc(bookings.travelStartDate))
      .limit(25),

    db
      .select({
        lifetimeValue: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint`,
        paymentCount: count(),
        lastPaidOn: sql<string | null>`max(${payments.paidOn})`,
      })
      .from(payments)
      .where(and(eq(payments.customerId, id), isNull(payments.deletedAt))),

    db
      .select({
        id: documents.id,
        documentCode: documents.documentCode,
        type: documents.type,
        title: documents.title,
        fileName: documents.fileName,
        mimeType: documents.mimeType,
        sizeBytes: documents.sizeBytes,
        version: documents.version,
        expiresOn: documents.expiresOn,
        verifiedAt: documents.verifiedAt,
        createdAt: documents.createdAt,
        daysToExpiry: sql<number | null>`(${documents.expiresOn} - current_date)::int`,
      })
      .from(documents)
      .where(
        and(
          eq(documents.customerId, id),
          isNull(documents.deletedAt),
          // A caller without sensitive access does not even learn that a
          // passport scan exists on this profile.
          canSeeSensitive
            ? sql`true`
            : sql`${documents.type} not in ('PASSPORT', 'VISA', 'IDENTITY_PROOF')`,
        ),
      )
      .orderBy(desc(documents.createdAt)),

    db
      .select({
        id: visaCases.id,
        caseCode: visaCases.caseCode,
        currentStep: visaCases.currentStep,
        travelDate: visaCases.travelDate,
        decision: visaCases.decision,
        visaValidTo: visaCases.visaValidTo,
        countryName: visaCountries.name,
      })
      .from(visaCases)
      .leftJoin(visaCountries, eq(visaCountries.id, visaCases.visaCountryId))
      .where(and(eq(visaCases.customerId, id), isNull(visaCases.deletedAt)))
      .orderBy(desc(visaCases.createdAt)),

    db
      .select({
        groupId: customerGroups.id,
        groupName: customerGroups.name,
        memberId: customers.id,
        memberName: customers.fullName,
        memberCode: customers.customerCode,
        relationship: customerGroupMembers.relationship,
      })
      .from(customerGroupMembers)
      .innerJoin(customerGroups, eq(customerGroups.id, customerGroupMembers.groupId))
      .innerJoin(customers, eq(customers.id, customerGroupMembers.customerId))
      .where(
        sql`${customerGroupMembers.groupId} in (
          select group_id from ${customerGroupMembers} where customer_id = ${id}
        )`,
      ),
  ]);

  const totals = paymentTotals[0];

  return {
    ...profile,
    preferences: preferences[0] ?? null,
    passports,
    leads: customerLeads,
    bookings: customerBookings,
    finance: {
      lifetimeValue: Number(totals?.lifetimeValue ?? 0),
      paymentCount: totals?.paymentCount ?? 0,
      lastPaidOn: totals?.lastPaidOn ?? null,
      outstanding: customerBookings.reduce((sum, b) => sum + (b.amountOutstanding ?? 0), 0),
    },
    documents: customerDocuments,
    visaCases: customerVisaCases,
    group: groupMembers.filter((m) => m.memberId !== id),
    /** True when some documents were withheld from this caller. */
    documentsRestricted: !canSeeSensitive,
  };
}

export async function createCustomer(
  input: CreateCustomerInput,
  viewer: AuthenticatedUser,
  ctx: AuditContext,
) {
  const phone = normalisePhone(input.primaryPhone);
  const nameNormalised = normaliseName(input.fullName);

  if (!input.acknowledgeDuplicates) {
    const candidates = await findDuplicates({
      name: input.fullName,
      phone,
      email: input.email,
    });
    if (candidates.length > 0) {
      throw duplicateDetected('This person may already be in the system.', { candidates });
    }
  }

  return db.transaction(async (tx) => {
    const customerCode = await nextCode(tx, 'CUSTOMER');

    const [created] = await tx
      .insert(customers)
      .values({
        customerCode,
        fullName: input.fullName.trim(),
        nameNormalised,
        salutation: input.salutation ?? null,
        dateOfBirth: input.dateOfBirth ?? null,
        gender: input.gender ?? null,
        nationality: input.nationality,
        primaryPhone: phone,
        alternatePhone: input.alternatePhone ? normalisePhone(input.alternatePhone) : null,
        email: input.email ?? null,
        addressLine1: input.addressLine1 ?? null,
        addressLine2: input.addressLine2 ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        postalCode: input.postalCode ?? null,
        country: input.country,
        ownerId: input.ownerId ?? viewer.id,
        notes: input.notes ?? null,
        lastActivityAt: new Date().toISOString().slice(0, 10),
      })
      .returning();

    if (!created) throw new Error('Customer insert returned no row');

    await recordAudit(
      {
        ...ctx,
        action: 'customer.created',
        entityType: 'customer',
        entityId: created.id,
        entityCode: created.customerCode,
        after: { fullName: created.fullName, tier: created.tier },
        summary: `Customer ${created.customerCode} created`,
      },
      tx,
    );

    return created;
  });
}

export async function updateCustomer(id: string, input: UpdateCustomerInput, ctx: AuditContext) {
  const [before] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
    .limit(1);

  if (!before) throw notFound('Customer');

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(customers)
      .set({
        ...(input.fullName !== undefined
          ? { fullName: input.fullName, nameNormalised: normaliseName(input.fullName) }
          : {}),
        ...(input.salutation !== undefined ? { salutation: input.salutation ?? null } : {}),
        ...(input.primaryPhone !== undefined
          ? { primaryPhone: normalisePhone(input.primaryPhone) }
          : {}),
        ...(input.alternatePhone !== undefined
          ? { alternatePhone: input.alternatePhone ? normalisePhone(input.alternatePhone) : null }
          : {}),
        ...(input.email !== undefined ? { email: input.email ?? null } : {}),
        ...(input.dateOfBirth !== undefined ? { dateOfBirth: input.dateOfBirth ?? null } : {}),
        ...(input.gender !== undefined ? { gender: input.gender ?? null } : {}),
        ...(input.nationality !== undefined ? { nationality: input.nationality } : {}),
        ...(input.addressLine1 !== undefined ? { addressLine1: input.addressLine1 ?? null } : {}),
        ...(input.addressLine2 !== undefined ? { addressLine2: input.addressLine2 ?? null } : {}),
        ...(input.city !== undefined ? { city: input.city ?? null } : {}),
        ...(input.state !== undefined ? { state: input.state ?? null } : {}),
        ...(input.postalCode !== undefined ? { postalCode: input.postalCode ?? null } : {}),
        ...(input.country !== undefined ? { country: input.country } : {}),
        ...(input.ownerId !== undefined ? { ownerId: input.ownerId ?? null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.tier !== undefined ? { tier: input.tier } : {}),
      })
      .where(eq(customers.id, id))
      .returning();

    if (!updated) throw notFound('Customer');

    await recordAudit(
      {
        ...ctx,
        action: 'customer.updated',
        entityType: 'customer',
        entityId: id,
        entityCode: updated.customerCode,
        before: { fullName: before.fullName, email: before.email, tier: before.tier },
        after: { fullName: updated.fullName, email: updated.email, tier: updated.tier },
        summary: `Customer ${updated.customerCode} updated`,
      },
      tx,
    );

    return updated;
  });
}

export async function upsertPreferences(
  customerId: string,
  input: CustomerPreferencesInput,
  ctx: AuditContext,
) {
  const [customer] = await db
    .select({ id: customers.id, code: customers.customerCode })
    .from(customers)
    .where(and(eq(customers.id, customerId), isNull(customers.deletedAt)))
    .limit(1);

  if (!customer) throw notFound('Customer');

  const values = {
    customerId,
    mealPreference: input.mealPreference ?? null,
    seatPreference: input.seatPreference ?? null,
    hotelCategory: input.hotelCategory ?? null,
    roomPreference: input.roomPreference ?? null,
    interests: input.interests,
    dietaryRestrictions: input.dietaryRestrictions ?? null,
    accessibilityNeeds: input.accessibilityNeeds ?? null,
    preferredLanguage: input.preferredLanguage ?? null,
    notes: input.notes ?? null,
  };

  const [saved] = await db
    .insert(customerPreferences)
    .values(values)
    .onConflictDoUpdate({ target: customerPreferences.customerId, set: values })
    .returning();

  await recordAudit({
    ...ctx,
    action: 'customer.preferences_updated',
    entityType: 'customer',
    entityId: customerId,
    entityCode: customer.code,
    summary: 'Travel preferences updated',
  });

  return saved;
}

/**
 * Records a passport. The number is never stored in the clear: the profile
 * keeps a masked form for display and a peppered fingerprint so the same
 * passport can be recognised across customers without being readable.
 */
export async function addPassport(
  customerId: string,
  input: PassportInput,
  ctx: AuditContext,
) {
  const [customer] = await db
    .select({ id: customers.id, code: customers.customerCode, name: customers.fullName })
    .from(customers)
    .where(and(eq(customers.id, customerId), isNull(customers.deletedAt)))
    .limit(1);

  if (!customer) throw notFound('Customer');

  const numberHash = fingerprint(input.passportNumber);

  const [clash] = await db
    .select({ id: customerPassports.id, customerId: customerPassports.customerId })
    .from(customerPassports)
    .where(
      and(
        eq(customerPassports.passportNumberHash, numberHash),
        isNull(customerPassports.deletedAt),
      ),
    )
    .limit(1);

  if (clash && clash.customerId !== customerId) {
    throw badRequest('That passport number is already recorded against another customer.');
  }

  return db.transaction(async (tx) => {
    if (input.isPrimary) {
      await tx
        .update(customerPassports)
        .set({ isPrimary: false })
        .where(eq(customerPassports.customerId, customerId));
    }

    const [saved] = await tx
      .insert(customerPassports)
      .values({
        customerId,
        passportNumberMasked: maskIdNumber(input.passportNumber),
        passportNumberHash: numberHash,
        fullNameOnPassport: input.fullNameOnPassport ?? customer.name,
        nationality: input.nationality,
        issuedOn: input.issuedOn ?? null,
        expiresOn: input.expiresOn,
        placeOfIssue: input.placeOfIssue ?? null,
        isPrimary: input.isPrimary,
      })
      .returning();

    await recordAudit(
      {
        ...ctx,
        action: 'customer.passport_added',
        entityType: 'customer',
        entityId: customerId,
        entityCode: customer.code,
        // The number itself is deliberately absent from the audit payload.
        after: { expiresOn: input.expiresOn, nationality: input.nationality },
        summary: 'Passport recorded',
      },
      tx,
    );

    return saved;
  });
}

/**
 * Unified activity timeline (spec §15). Leads, bookings, payments, documents,
 * follow-ups and notes merged chronologically, so a customer reads as one
 * continuous relationship rather than six disconnected tabs.
 */
export async function customerTimeline(id: string, viewer: AuthenticatedUser) {
  const canSeeSensitive = viewer.permissions.includes('document.read.sensitive');

  const [leadRows, bookingRows, paymentRows, documentRows, followupRows, noteRows] =
    await Promise.all([
      db
        .select({
          at: leads.createdAt,
          leadId: leads.id,
          leadCode: leads.leadCode,
          destination: leads.destination,
          status: leads.status,
        })
        .from(leads)
        .where(and(eq(leads.customerId, id), isNull(leads.deletedAt))),

      db
        .select({
          at: bookings.createdAt,
          bookingCode: bookings.bookingCode,
          totalAmount: bookings.totalAmount,
          status: bookings.status,
        })
        .from(bookings)
        .where(and(eq(bookings.customerId, id), isNull(bookings.deletedAt))),

      db
        .select({
          at: payments.createdAt,
          amount: payments.amount,
          paidOn: payments.paidOn,
          isRefund: payments.isRefund,
        })
        .from(payments)
        .where(and(eq(payments.customerId, id), isNull(payments.deletedAt))),

      db
        .select({ at: documents.createdAt, title: documents.title, type: documents.type })
        .from(documents)
        .where(
          and(
            eq(documents.customerId, id),
            isNull(documents.deletedAt),
            canSeeSensitive
              ? sql`true`
              : sql`${documents.type} not in ('PASSPORT', 'VISA', 'IDENTITY_PROOF')`,
          ),
        ),

      db
        .select({
          at: followups.completedAt,
          type: followups.type,
          outcome: followups.outcome,
        })
        .from(followups)
        .where(
          and(
            eq(followups.customerId, id),
            eq(followups.status, 'COMPLETED'),
            isNull(followups.deletedAt),
          ),
        ),

      db
        .select({ at: notes.createdAt, body: notes.body, actor: users.fullName })
        .from(notes)
        .leftJoin(users, eq(users.id, notes.createdById))
        .where(and(eq(notes.customerId, id), isNull(notes.deletedAt))),
    ]);

  const entries = [
    ...leadRows.map((r) => ({ kind: 'LEAD' as const, ...r })),
    ...bookingRows.map((r) => ({ kind: 'BOOKING' as const, ...r })),
    ...paymentRows.map((r) => ({ kind: 'PAYMENT' as const, ...r })),
    ...documentRows.map((r) => ({ kind: 'DOCUMENT' as const, ...r })),
    ...followupRows.map((r) => ({ kind: 'FOLLOWUP' as const, ...r })),
    ...noteRows.map((r) => ({ kind: 'NOTE' as const, ...r })),
  ].filter((e): e is typeof e & { at: Date } => e.at instanceof Date);

  return entries.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/**
 * Recomputes booking counts, lifetime value and tier from the customer's actual
 * history. Called after a booking or payment changes.
 */
export async function refreshCustomerStanding(customerId: string): Promise<void> {
  const [stats] = await db
    .select({
      bookingCount: sql<number>`count(distinct ${bookings.id}) filter (where ${bookings.status} <> 'CANCELLED')::int`,
      firstBooking: sql<string | null>`min(${bookings.travelStartDate})`,
      lastBooking: sql<string | null>`max(${bookings.travelStartDate})`,
    })
    .from(bookings)
    .where(and(eq(bookings.customerId, customerId), isNull(bookings.deletedAt)));

  const [money] = await db
    .select({ lifetime: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint` })
    .from(payments)
    .where(and(eq(payments.customerId, customerId), isNull(payments.deletedAt)));

  const bookingCount = stats?.bookingCount ?? 0;
  const { tier, score } = customerStanding({
    totalBookings: bookingCount,
    lifetimeValuePaise: Number(money?.lifetime ?? 0),
  });

  await db
    .update(customers)
    .set({
      totalBookings: bookingCount,
      tier,
      relationshipScore: score,
      firstBookingAt: stats?.firstBooking ?? null,
      lastBookingAt: stats?.lastBooking ?? null,
      lastActivityAt: new Date().toISOString().slice(0, 10),
    })
    .where(eq(customers.id, customerId));
}
