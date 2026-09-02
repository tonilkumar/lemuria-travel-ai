import type { AuthenticatedUser, CreateFollowupInput } from '@lemuria/shared';
import { and, asc, count, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { users } from '../../db/schema/auth.js';
import { followups, leads } from '../../db/schema/leads.js';
import { recordAudit, type AuditContext } from '../../lib/audit.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';

/**
 * Recomputes `leads.next_followup_at` from the lead's open follow-ups.
 *
 * The column is denormalised so the lead list can sort and filter on it without
 * a correlated subquery; this is the single place allowed to write it.
 */
async function syncNextFollowup(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db,
  leadId: string,
): Promise<void> {
  const [next] = await tx
    .select({ dueAt: followups.dueAt })
    .from(followups)
    .where(
      and(
        eq(followups.leadId, leadId),
        inArray(followups.status, ['PENDING', 'OVERDUE']),
        isNull(followups.deletedAt),
      ),
    )
    .orderBy(asc(followups.dueAt))
    .limit(1);

  await tx
    .update(leads)
    .set({ nextFollowupAt: next?.dueAt ?? null })
    .where(eq(leads.id, leadId));
}

export const followupBucketSchema = z.enum(['OVERDUE', 'TODAY', 'UPCOMING']);

export async function listFollowups(
  params: {
    page: number;
    pageSize: number;
    bucket?: 'OVERDUE' | 'TODAY' | 'UPCOMING';
    assignedToId?: string;
    mine?: boolean;
    status?: string[];
  },
  viewer: AuthenticatedUser,
) {
  const conditions = [isNull(followups.deletedAt)];

  if (params.mine || !viewer.permissions.includes('lead.read.all')) {
    conditions.push(eq(followups.assignedToId, viewer.id));
  } else if (params.assignedToId) {
    conditions.push(eq(followups.assignedToId, params.assignedToId));
  }

  if (params.bucket === 'OVERDUE') {
    conditions.push(inArray(followups.status, ['PENDING', 'OVERDUE']));
    conditions.push(lt(followups.dueAt, sql`now()`));
  } else if (params.bucket === 'TODAY') {
    conditions.push(inArray(followups.status, ['PENDING', 'OVERDUE']));
    conditions.push(sql`${followups.dueAt}::date = current_date`);
  } else if (params.bucket === 'UPCOMING') {
    conditions.push(eq(followups.status, 'PENDING'));
    conditions.push(sql`${followups.dueAt} > now()`);
  }

  const where = and(...conditions);

  const rows = await db
    .select({
      id: followups.id,
      type: followups.type,
      status: followups.status,
      priority: followups.priority,
      dueAt: followups.dueAt,
      description: followups.description,
      completedAt: followups.completedAt,
      outcome: followups.outcome,
      lead: {
        id: leads.id,
        leadCode: leads.leadCode,
        customerName: leads.customerName,
        phone: leads.phone,
        classification: leads.classification,
      },
      assignedTo: { id: users.id, fullName: users.fullName, avatarUrl: users.avatarUrl },
    })
    .from(followups)
    .leftJoin(leads, eq(leads.id, followups.leadId))
    .leftJoin(users, eq(users.id, followups.assignedToId))
    .where(where)
    .orderBy(asc(followups.dueAt))
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: count() })
    .from(followups)
    .where(where);

  return { rows, total };
}

/**
 * Bucket counts for the tab bar and the dashboard card.
 *
 * `scopeToSelf` must be driven by the same rule the caller uses for the list
 * itself — a tab labelled "Overdue 0" above five overdue rows is worse than no
 * count at all.
 */
export async function followupBuckets(viewer: AuthenticatedUser, scopeToSelf = false) {
  const conditions = [isNull(followups.deletedAt), inArray(followups.status, ['PENDING', 'OVERDUE'])];
  if (scopeToSelf || !viewer.permissions.includes('lead.read.all')) {
    conditions.push(eq(followups.assignedToId, viewer.id));
  }

  const [row] = await db
    .select({
      overdue: sql<number>`count(*) filter (where ${followups.dueAt} < now())::int`,
      today: sql<number>`count(*) filter (where ${followups.dueAt}::date = current_date and ${followups.dueAt} >= now())::int`,
      upcoming: sql<number>`count(*) filter (where ${followups.dueAt}::date > current_date)::int`,
    })
    .from(followups)
    .where(and(...conditions));

  return row ?? { overdue: 0, today: 0, upcoming: 0 };
}

export async function createFollowup(
  input: CreateFollowupInput,
  viewer: AuthenticatedUser,
  ctx: AuditContext,
) {
  const dueAt = new Date(input.dueAt);
  if (Number.isNaN(dueAt.getTime())) throw badRequest('Enter a valid follow-up date and time.');

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(followups)
      .values({
        leadId: input.leadId ?? null,
        customerId: input.customerId ?? null,
        assignedToId: input.assignedToId ?? viewer.id,
        type: input.type,
        priority: input.priority,
        dueAt,
        description: input.description,
        status: 'PENDING',
        createdById: viewer.id,
      })
      .returning();

    if (!created) throw new Error('Follow-up insert returned no row');
    if (created.leadId) await syncNextFollowup(tx, created.leadId);

    await recordAudit(
      {
        ...ctx,
        action: 'followup.created',
        entityType: 'followup',
        entityId: created.id,
        after: { type: created.type, dueAt: created.dueAt.toISOString() },
        summary: `${created.type} follow-up scheduled`,
      },
      tx,
    );

    return created;
  });
}

export async function completeFollowup(
  id: string,
  input: { outcome?: string; nextFollowup?: CreateFollowupInput | undefined },
  viewer: AuthenticatedUser,
  ctx: AuditContext,
) {
  const [existing] = await db.select().from(followups).where(eq(followups.id, id)).limit(1);
  if (!existing || existing.deletedAt) throw notFound('Follow-up');

  if (
    existing.assignedToId !== viewer.id &&
    !viewer.permissions.includes('lead.read.all')
  ) {
    throw forbidden('This follow-up belongs to another executive.');
  }

  if (existing.status === 'COMPLETED') {
    throw badRequest('This follow-up is already marked complete.');
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(followups)
      .set({
        status: 'COMPLETED',
        completedAt: new Date(),
        completedById: viewer.id,
        outcome: input.outcome ?? null,
      })
      .where(eq(followups.id, id))
      .returning();

    // Completing a follow-up is a contact event; the lead list shows it.
    if (existing.leadId) {
      await tx
        .update(leads)
        .set({ lastContactAt: new Date(), lastContactChannel: existing.type })
        .where(eq(leads.id, existing.leadId));
    }

    let created = null;
    if (input.nextFollowup) {
      const [row] = await tx
        .insert(followups)
        .values({
          leadId: existing.leadId,
          customerId: existing.customerId,
          assignedToId: viewer.id,
          type: input.nextFollowup.type,
          priority: input.nextFollowup.priority,
          dueAt: new Date(input.nextFollowup.dueAt),
          description: input.nextFollowup.description,
          status: 'PENDING',
          previousFollowupId: id,
          createdById: viewer.id,
        })
        .returning();
      created = row ?? null;
    }

    if (existing.leadId) await syncNextFollowup(tx, existing.leadId);

    await recordAudit(
      {
        ...ctx,
        action: 'followup.completed',
        entityType: 'followup',
        entityId: id,
        before: { status: existing.status },
        after: { status: 'COMPLETED' },
        summary: input.outcome ? `Completed: ${input.outcome.slice(0, 120)}` : 'Follow-up completed',
      },
      tx,
    );

    return { completed: updated, next: created };
  });
}

/**
 * Marks past-due PENDING follow-ups as OVERDUE. Run by the scheduler, not on
 * read, so every query and dashboard sees the same state at the same moment.
 */
export async function markOverdue(): Promise<number> {
  const rows = await db
    .update(followups)
    .set({ status: 'OVERDUE' })
    .where(
      and(eq(followups.status, 'PENDING'), lt(followups.dueAt, sql`now()`), isNull(followups.deletedAt)),
    )
    .returning({ id: followups.id });
  return rows.length;
}
