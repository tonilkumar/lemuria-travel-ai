import type {
  AuthenticatedUser,
  CreateLeadInput,
  LeadListQuery,
  LeadStatus,
  UpdateLeadInput,
} from '@lemuria/shared';
import { canTransition } from '@lemuria/shared';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { users } from '../../db/schema/auth.js';
import { customers } from '../../db/schema/customers.js';
import {
  followups,
  leadAssignments,
  leads,
  leadScores,
  leadStatusHistory,
} from '../../db/schema/leads.js';
import { leadSources, travelTypes } from '../../db/schema/masterdata.js';
import { recordAudit, type AuditContext } from '../../lib/audit.js';
import { nextCode, normaliseName, normalisePhone } from '../../lib/codes.js';
import { badRequest, duplicateDetected, forbidden, invalidTransition, notFound } from '../../lib/errors.js';
import { findDuplicates } from './duplicate.service.js';
import { ageHours, daysUntil, scoreLead } from './scoring.service.js';

/**
 * Columns the client may sort by. Anything else is rejected rather than
 * interpolated, so a sort parameter can never reach SQL as raw text.
 */
const SORTABLE = {
  createdAt: leads.createdAt,
  updatedAt: leads.updatedAt,
  score: leads.score,
  customerName: leads.customerName,
  nextFollowupAt: leads.nextFollowupAt,
  lastContactAt: leads.lastContactAt,
  travelDate: leads.travelDate,
  status: leads.status,
} as const;

const asArray = <T>(v: T | T[] | undefined): T[] | undefined =>
  v === undefined ? undefined : Array.isArray(v) ? v : [v];

/**
 * Builds the WHERE clause for the lead list.
 *
 * Conditions are only appended when a filter is actually present — passing a
 * NULL parameter into an optional range comparison makes Postgres unable to
 * infer the parameter type and the statement fails at PREPARE, not at execute.
 */
function buildLeadFilters(query: LeadListQuery, viewer: AuthenticatedUser) {
  const conditions = [isNull(leads.deletedAt)];

  // An executive without lead.read.all only ever sees their own book.
  const canSeeAll = viewer.permissions.includes('lead.read.all');
  if (!canSeeAll) {
    conditions.push(
      or(eq(leads.assignedToId, viewer.id), eq(leads.createdById, viewer.id)) ??
        sql`true`,
    );
  } else if (query.mine) {
    conditions.push(eq(leads.assignedToId, viewer.id));
  }

  if (query.unassigned) conditions.push(isNull(leads.assignedToId));
  else if (query.assignedToId) conditions.push(eq(leads.assignedToId, query.assignedToId));

  const statuses = asArray(query.status);
  if (statuses?.length) conditions.push(inArray(leads.status, statuses));

  const classifications = asArray(query.classification);
  if (classifications?.length) conditions.push(inArray(leads.classification, classifications));

  if (query.leadSourceId) conditions.push(eq(leads.leadSourceId, query.leadSourceId));
  if (query.minScore !== undefined) conditions.push(gte(leads.score, query.minScore));
  if (query.maxScore !== undefined) conditions.push(lte(leads.score, query.maxScore));

  if (query.createdFrom) {
    conditions.push(gte(leads.createdAt, sql`${query.createdFrom}::date`));
  }
  if (query.createdTo) {
    // Inclusive of the whole end day.
    conditions.push(lte(leads.createdAt, sql`${query.createdTo}::date + interval '1 day'`));
  }

  if (query.followupState) {
    const nowExpr = sql`now()`;
    if (query.followupState === 'OVERDUE') {
      conditions.push(sql`${leads.nextFollowupAt} < ${nowExpr}`);
    } else if (query.followupState === 'TODAY') {
      conditions.push(sql`${leads.nextFollowupAt}::date = current_date`);
    } else if (query.followupState === 'UPCOMING') {
      conditions.push(sql`${leads.nextFollowupAt} > ${nowExpr}`);
    } else {
      conditions.push(isNull(leads.nextFollowupAt));
    }
  }

  if (query.search) {
    const term = `%${query.search.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const digits = normalisePhone(query.search);
    conditions.push(
      or(
        ilike(leads.customerName, term),
        ilike(leads.leadCode, term),
        ilike(leads.destination, term),
        ilike(leads.email, term),
        digits.length >= 4 ? ilike(leads.phone, `%${digits}%`) : sql`false`,
      ) ?? sql`true`,
    );
  }

  return and(...conditions);
}

export async function listLeads(query: LeadListQuery, viewer: AuthenticatedUser) {
  const where = buildLeadFilters(query, viewer);
  const sortColumn = SORTABLE[query.sortBy as keyof typeof SORTABLE] ?? leads.createdAt;
  const direction = query.sortDir === 'asc' ? asc : desc;
  const offset = (query.page - 1) * query.pageSize;

  const rows = await db
    .select({
      id: leads.id,
      leadCode: leads.leadCode,
      customerId: leads.customerId,
      customerName: leads.customerName,
      phone: leads.phone,
      email: leads.email,
      destination: leads.destination,
      travelDate: leads.travelDate,
      travellersAdults: leads.travellersAdults,
      travellersChildren: leads.travellersChildren,
      budgetAmount: leads.budgetAmount,
      status: leads.status,
      score: leads.score,
      classification: leads.classification,
      scoreReason: leads.scoreReason,
      nextFollowupAt: leads.nextFollowupAt,
      lastContactAt: leads.lastContactAt,
      lastContactChannel: leads.lastContactChannel,
      createdAt: leads.createdAt,
      source: { id: leadSources.id, name: leadSources.name, colour: leadSources.colour },
      assignedTo: {
        id: users.id,
        fullName: users.fullName,
        designation: users.designation,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(leads)
    .leftJoin(leadSources, eq(leadSources.id, leads.leadSourceId))
    .leftJoin(users, eq(users.id, leads.assignedToId))
    .where(where)
    .orderBy(direction(sortColumn), desc(leads.id))
    .limit(query.pageSize)
    .offset(offset);

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: count() })
    .from(leads)
    .where(where);

  return { rows, total };
}

/** KPI row above the lead table. Counted with the caller's own visibility rules. */
export async function leadSummary(query: LeadListQuery, viewer: AuthenticatedUser) {
  const base = buildLeadFilters({ ...query, status: undefined, classification: undefined }, viewer);

  const [row] = await db
    .select({
      total: count(),
      hot: sql<number>`count(*) filter (where ${leads.classification} = 'HOT')::int`,
      warm: sql<number>`count(*) filter (where ${leads.classification} = 'WARM')::int`,
      cold: sql<number>`count(*) filter (where ${leads.classification} = 'COLD')::int`,
      converted: sql<number>`count(*) filter (where ${leads.status} = 'CONVERTED')::int`,
      lost: sql<number>`count(*) filter (where ${leads.status} = 'LOST')::int`,
      overdueFollowups: sql<number>`count(*) filter (where ${leads.nextFollowupAt} < now())::int`,
      unassigned: sql<number>`count(*) filter (where ${leads.assignedToId} is null)::int`,
    })
    .from(leads)
    .where(base);

  return (
    row ?? {
      total: 0,
      hot: 0,
      warm: 0,
      cold: 0,
      converted: 0,
      lost: 0,
      overdueFollowups: 0,
      unassigned: 0,
    }
  );
}

export async function getLead(id: string, viewer: AuthenticatedUser) {
  const [row] = await db
    .select({
      lead: leads,
      source: leadSources,
      travelType: travelTypes,
      assignedTo: {
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        designation: users.designation,
        avatarUrl: users.avatarUrl,
      },
      customer: {
        id: customers.id,
        customerCode: customers.customerCode,
        fullName: customers.fullName,
        tier: customers.tier,
      },
    })
    .from(leads)
    .leftJoin(leadSources, eq(leadSources.id, leads.leadSourceId))
    .leftJoin(travelTypes, eq(travelTypes.id, leads.travelTypeId))
    .leftJoin(users, eq(users.id, leads.assignedToId))
    .leftJoin(customers, eq(customers.id, leads.customerId))
    .where(and(eq(leads.id, id), isNull(leads.deletedAt)))
    .limit(1);

  if (!row) throw notFound('Lead');

  const canSeeAll = viewer.permissions.includes('lead.read.all');
  const isOwn = row.lead.assignedToId === viewer.id || row.lead.createdById === viewer.id;
  if (!canSeeAll && !isOwn) throw forbidden('This lead is assigned to another executive.');

  return row;
}

/**
 * Creates an enquiry.
 *
 * Duplicate detection runs first and, unless the caller has already seen and
 * acknowledged the candidates, the request is rejected with the candidate list
 * so the UI can offer "use existing" versus "create anyway" (spec §12).
 */
export async function createLead(
  input: CreateLeadInput,
  viewer: AuthenticatedUser,
  ctx: AuditContext,
) {
  const phone = normalisePhone(input.phone);
  const nameNormalised = normaliseName(input.customerName);

  if (!input.acknowledgeDuplicates && !input.linkToCustomerId) {
    const candidates = await findDuplicates({
      name: input.customerName,
      phone,
      email: input.email,
    });
    if (candidates.length > 0) {
      throw duplicateDetected('This person may already be in the system.', { candidates });
    }
  }

  const [source] = await db
    .select({ id: leadSources.id, weight: leadSources.scoreWeight, isActive: leadSources.isActive })
    .from(leadSources)
    .where(eq(leadSources.id, input.leadSourceId))
    .limit(1);

  if (!source || !source.isActive) throw badRequest('Select an active lead source.');

  const scored = scoreLead({
    daysToTravel: daysUntil(input.travelDate ?? null),
    budgetAmount: input.budgetAmount ? Math.round(input.budgetAmount * 100) : null,
    travellerCount: input.travellersAdults + input.travellersChildren,
    sourceWeight: source.weight,
    hasEmail: Boolean(input.email),
    hasDestination: Boolean(input.destination),
    previousBookings: 0,
    ageHours: 0,
    interactionCount: 0,
  });

  return db.transaction(async (tx) => {
    const leadCode = await nextCode(tx, 'LEAD');

    const [created] = await tx
      .insert(leads)
      .values({
        leadCode,
        customerId: input.linkToCustomerId ?? null,
        customerName: input.customerName.trim(),
        nameNormalised,
        phone,
        email: input.email ?? null,
        destination: input.destination ?? null,
        travelDate: input.travelDate ?? null,
        travelDateFlexible: input.travelDateFlexible,
        travellersAdults: input.travellersAdults,
        travellersChildren: input.travellersChildren,
        travelTypeId: input.travelTypeId ?? null,
        budgetAmount: input.budgetAmount ? Math.round(input.budgetAmount * 100) : null,
        budgetCurrency: input.budgetCurrency,
        leadSourceId: input.leadSourceId,
        status: 'OPEN',
        score: scored.score,
        classification: scored.classification,
        scoreReason: scored.reason,
        scoredAt: new Date(),
        assignedToId: input.assignedToId ?? viewer.id,
        assignedAt: new Date(),
        createdById: viewer.id,
        notes: input.notes ?? null,
      })
      .returning();

    if (!created) throw new Error('Lead insert returned no row');

    await tx.insert(leadScores).values({
      leadId: created.id,
      score: scored.score,
      classification: scored.classification,
      reason: scored.reason,
      factors: scored.factors,
      isManual: false,
      createdById: viewer.id,
    });

    await tx.insert(leadStatusHistory).values({
      leadId: created.id,
      fromStatus: null,
      toStatus: 'OPEN',
      changedById: viewer.id,
    });

    await tx.insert(leadAssignments).values({
      leadId: created.id,
      fromUserId: null,
      toUserId: created.assignedToId,
      assignedById: viewer.id,
      reason: input.assignedToId ? 'Assigned at creation' : 'Self-assigned at creation',
    });

    await recordAudit(
      {
        ...ctx,
        action: 'lead.created',
        entityType: 'lead',
        entityId: created.id,
        entityCode: created.leadCode,
        after: { customerName: created.customerName, status: created.status, score: created.score },
        summary: `Enquiry ${created.leadCode} created`,
      },
      tx,
    );

    return created;
  });
}

export async function updateLead(
  id: string,
  input: UpdateLeadInput,
  viewer: AuthenticatedUser,
  ctx: AuditContext,
) {
  const existing = await getLead(id, viewer);
  const before = existing.lead;

  if (input.status && input.status !== before.status) {
    if (!canTransition(before.status as LeadStatus, input.status)) {
      throw invalidTransition(
        `A lead cannot move from ${before.status} to ${input.status}.`,
        { from: before.status, to: input.status },
      );
    }
    if (input.status === 'LOST' && !input.lostReason) {
      throw badRequest('Record why this lead was lost.');
    }
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(leads)
      .set({
        ...(input.customerName !== undefined
          ? { customerName: input.customerName, nameNormalised: normaliseName(input.customerName) }
          : {}),
        ...(input.phone !== undefined ? { phone: normalisePhone(input.phone) } : {}),
        ...(input.email !== undefined ? { email: input.email ?? null } : {}),
        ...(input.destination !== undefined ? { destination: input.destination ?? null } : {}),
        ...(input.travelDate !== undefined ? { travelDate: input.travelDate ?? null } : {}),
        ...(input.travellersAdults !== undefined
          ? { travellersAdults: input.travellersAdults }
          : {}),
        ...(input.travellersChildren !== undefined
          ? { travellersChildren: input.travellersChildren }
          : {}),
        ...(input.travelTypeId !== undefined ? { travelTypeId: input.travelTypeId ?? null } : {}),
        ...(input.budgetAmount !== undefined
          ? { budgetAmount: input.budgetAmount ? Math.round(input.budgetAmount * 100) : null }
          : {}),
        ...(input.leadSourceId !== undefined ? { leadSourceId: input.leadSourceId } : {}),
        ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.lostReason !== undefined ? { lostReason: input.lostReason ?? null } : {}),
      })
      .where(eq(leads.id, id))
      .returning();

    if (!updated) throw notFound('Lead');

    if (input.status && input.status !== before.status) {
      await tx.insert(leadStatusHistory).values({
        leadId: id,
        fromStatus: before.status,
        toStatus: input.status,
        reason: input.lostReason ?? null,
        changedById: viewer.id,
      });
    }

    await recordAudit(
      {
        ...ctx,
        action: 'lead.updated',
        entityType: 'lead',
        entityId: id,
        entityCode: updated.leadCode,
        before: { status: before.status, customerName: before.customerName },
        after: { status: updated.status, customerName: updated.customerName },
        summary: `Enquiry ${updated.leadCode} updated`,
      },
      tx,
    );

    return updated;
  });
}

export async function assignLead(
  id: string,
  assignedToId: string,
  reason: string | undefined,
  viewer: AuthenticatedUser,
  ctx: AuditContext,
) {
  const [target] = await db
    .select({ id: users.id, isActive: users.isActive })
    .from(users)
    .where(and(eq(users.id, assignedToId), isNull(users.deletedAt)))
    .limit(1);

  if (!target || !target.isActive) throw badRequest('Choose an active team member.');

  const [before] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!before) throw notFound('Lead');

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(leads)
      .set({ assignedToId, assignedAt: new Date() })
      .where(eq(leads.id, id))
      .returning();

    await tx.insert(leadAssignments).values({
      leadId: id,
      fromUserId: before.assignedToId,
      toUserId: assignedToId,
      assignedById: viewer.id,
      reason: reason ?? null,
    });

    await recordAudit(
      {
        ...ctx,
        action: 'lead.assigned',
        entityType: 'lead',
        entityId: id,
        entityCode: before.leadCode,
        before: { assignedToId: before.assignedToId },
        after: { assignedToId },
        summary: `Enquiry ${before.leadCode} reassigned`,
      },
      tx,
    );

    return updated;
  });
}

/**
 * Re-runs scoring against the lead's current state. Called after follow-ups and
 * status changes; safe to call repeatedly.
 */
export async function rescoreLead(id: string, viewer: AuthenticatedUser): Promise<void> {
  const [row] = await db
    .select({
      lead: leads,
      sourceWeight: leadSources.scoreWeight,
      interactions: sql<number>`(select count(*)::int from ${followups} f where f.lead_id = ${leads.id} and f.status = 'COMPLETED')`,
      previousBookings: sql<number>`coalesce((select c.total_bookings from ${customers} c where c.id = ${leads.customerId}), 0)`,
    })
    .from(leads)
    .leftJoin(leadSources, eq(leadSources.id, leads.leadSourceId))
    .where(eq(leads.id, id))
    .limit(1);

  if (!row) throw notFound('Lead');
  if (row.lead.scoreIsManual) return; // A human override is never overwritten.

  const scored = scoreLead({
    daysToTravel: daysUntil(row.lead.travelDate),
    budgetAmount: row.lead.budgetAmount,
    travellerCount: row.lead.travellersAdults + row.lead.travellersChildren,
    sourceWeight: row.sourceWeight ?? 50,
    hasEmail: Boolean(row.lead.email),
    hasDestination: Boolean(row.lead.destination),
    previousBookings: row.previousBookings,
    ageHours: ageHours(row.lead.createdAt),
    interactionCount: row.interactions,
  });

  if (scored.score === row.lead.score && scored.classification === row.lead.classification) return;

  await db.transaction(async (tx) => {
    await tx
      .update(leads)
      .set({
        score: scored.score,
        classification: scored.classification,
        scoreReason: scored.reason,
        scoredAt: new Date(),
      })
      .where(eq(leads.id, id));

    await tx.insert(leadScores).values({
      leadId: id,
      score: scored.score,
      classification: scored.classification,
      reason: scored.reason,
      factors: scored.factors,
      isManual: false,
      createdById: viewer.id,
    });
  });
}
