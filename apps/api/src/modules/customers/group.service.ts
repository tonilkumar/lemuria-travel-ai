import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { customerGroupMembers, customerGroups, customers } from '../../db/schema/customers.js';
import { recordAudit, type AuditContext } from '../../lib/audit.js';
import { badRequest, notFound } from '../../lib/errors.js';

/**
 * Family and travel groups.
 *
 * A group is a set of customers who travel together, not a household record —
 * an adult child booking for their parents belongs in the same group as them
 * without either becoming a sub-record of the other. Every member keeps their
 * own profile, passport and history.
 */

async function loadCustomer(id: string) {
  const [row] = await db
    .select({ id: customers.id, code: customers.customerCode, name: customers.fullName })
    .from(customers)
    .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
    .limit(1);
  return row ?? null;
}

async function groupIdFor(customerId: string): Promise<string | null> {
  const [row] = await db
    .select({ groupId: customerGroupMembers.groupId })
    .from(customerGroupMembers)
    .where(eq(customerGroupMembers.customerId, customerId))
    .limit(1);
  return row?.groupId ?? null;
}

/**
 * Links two customers into the same group.
 *
 * If neither is in a group, one is created named after the anchor customer. If
 * exactly one is, the other joins it. If both already belong to *different*
 * groups the request is refused rather than silently merging two families —
 * that is a decision for a human, and an accidental merge is painful to undo.
 */
export async function linkGroupMember(
  anchorId: string,
  memberId: string,
  relationship: string | undefined,
  ctx: AuditContext,
) {
  if (anchorId === memberId) throw badRequest('A customer cannot be linked to themselves.');

  const anchor = await loadCustomer(anchorId);
  if (!anchor) throw notFound('Customer');

  const member = await loadCustomer(memberId);
  if (!member) throw badRequest('That customer no longer exists.');

  const anchorGroup = await groupIdFor(anchorId);
  const memberGroup = await groupIdFor(memberId);

  if (anchorGroup && memberGroup && anchorGroup !== memberGroup) {
    throw badRequest(
      `${member.name} already belongs to a different travel group. Remove them from it first.`,
    );
  }
  if (anchorGroup && anchorGroup === memberGroup) {
    throw badRequest(`${member.name} is already in this group.`);
  }

  return db.transaction(async (tx) => {
    let groupId = anchorGroup ?? memberGroup;

    if (!groupId) {
      const [created] = await tx
        .insert(customerGroups)
        .values({
          name: `${anchor.name.split(' ').slice(-1)[0] ?? anchor.name} family`,
          primaryCustomerId: anchorId,
        })
        .returning({ id: customerGroups.id });

      if (!created) throw new Error('Group insert returned no row');
      groupId = created.id;

      await tx
        .insert(customerGroupMembers)
        .values({ groupId, customerId: anchorId, relationship: null })
        .onConflictDoNothing();
    }

    await tx
      .insert(customerGroupMembers)
      .values({ groupId, customerId: memberId, relationship: relationship ?? null })
      .onConflictDoNothing();

    // Keep the denormalised pointer on both rows current.
    await tx
      .update(customers)
      .set({ groupId })
      .where(sql`${customers.id} in (${anchorId}, ${memberId})`);

    await recordAudit(
      {
        ...ctx,
        action: 'customer.group_linked',
        entityType: 'customer',
        entityId: anchorId,
        entityCode: anchor.code,
        after: { linkedCustomerId: memberId, relationship: relationship ?? null },
        summary: `${member.name} linked to ${anchor.name}${relationship ? ` as ${relationship}` : ''}`,
      },
      tx,
    );

    return { groupId, linked: member };
  });
}

export async function unlinkGroupMember(anchorId: string, memberId: string, ctx: AuditContext) {
  const anchor = await loadCustomer(anchorId);
  if (!anchor) throw notFound('Customer');

  const groupId = await groupIdFor(anchorId);
  if (!groupId) throw badRequest('This customer is not in a travel group.');

  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(customerGroupMembers)
      .where(
        and(
          eq(customerGroupMembers.groupId, groupId),
          eq(customerGroupMembers.customerId, memberId),
        ),
      )
      .returning({ id: customerGroupMembers.id });

    if (removed.length === 0) throw notFound('Group member');

    await tx.update(customers).set({ groupId: null }).where(eq(customers.id, memberId));

    // A group of one is not a group; clean it up rather than leaving a stub.
    const remaining = await tx
      .select({ customerId: customerGroupMembers.customerId })
      .from(customerGroupMembers)
      .where(eq(customerGroupMembers.groupId, groupId));

    if (remaining.length <= 1) {
      for (const row of remaining) {
        await tx.update(customers).set({ groupId: null }).where(eq(customers.id, row.customerId));
      }
      await tx.delete(customerGroupMembers).where(eq(customerGroupMembers.groupId, groupId));
      await tx.delete(customerGroups).where(eq(customerGroups.id, groupId));
    }

    await recordAudit(
      {
        ...ctx,
        action: 'customer.group_unlinked',
        entityType: 'customer',
        entityId: anchorId,
        entityCode: anchor.code,
        before: { linkedCustomerId: memberId },
        summary: 'Travel group link removed',
      },
      tx,
    );

    return { unlinked: true, groupDissolved: remaining.length <= 1 };
  });
}
