import type { AuthenticatedUser, ConvertLeadInput } from '@lemuria/shared';
import { canTransition } from '@lemuria/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { customers } from '../../db/schema/customers.js';
import { documents } from '../../db/schema/documents.js';
import { followups, leads, leadStatusHistory, notes } from '../../db/schema/leads.js';
import { recordAudit, type AuditContext } from '../../lib/audit.js';
import { nextCode, normaliseName } from '../../lib/codes.js';
import { badRequest, conflict, invalidTransition, notFound } from '../../lib/errors.js';

/**
 * Converts a lead into a customer.
 *
 * The lead is never deleted, rewritten or replaced. It keeps its own code,
 * score history, status history, follow-ups and notes, and gains a link to the
 * customer — so "how did this customer come to us" stays answerable years later
 * (spec §10).
 *
 * The whole operation is one transaction: a half-converted lead pointing at a
 * customer that was not created would be worse than a failed conversion.
 */
export async function convertLead(
  leadId: string,
  input: ConvertLeadInput,
  viewer: AuthenticatedUser,
  ctx: AuditContext,
) {
  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)))
    .limit(1);

  if (!lead) throw notFound('Lead');

  if (lead.convertedAt || lead.status === 'CONVERTED') {
    throw conflict('This enquiry has already been converted.', {
      customerId: lead.customerId,
    });
  }

  if (!canTransition(lead.status, 'CONVERTED')) {
    throw invalidTransition(
      `An enquiry cannot be converted directly from ${lead.status}. Work it first, or send a quotation.`,
      { from: lead.status, to: 'CONVERTED' },
    );
  }

  // Linking to a named customer must fail loudly if that customer is gone.
  if (input.customerId) {
    const [target] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, input.customerId), isNull(customers.deletedAt)))
      .limit(1);
    if (!target) throw badRequest('That customer no longer exists.');
  }

  return db.transaction(async (tx) => {
    let customerId = input.customerId ?? lead.customerId ?? null;
    let customerCode: string;
    let created = false;

    if (customerId) {
      const [existing] = await tx
        .select({ code: customers.customerCode })
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);
      customerCode = existing?.code ?? '';
    } else {
      // Build the customer from the lead, with any explicit overrides on top.
      const o = input.customer ?? {};
      const fullName = (o.fullName ?? lead.customerName).trim();
      customerCode = await nextCode(tx, 'CUSTOMER');

      const [newCustomer] = await tx
        .insert(customers)
        .values({
          customerCode,
          fullName,
          nameNormalised: normaliseName(fullName),
          salutation: o.salutation ?? null,
          dateOfBirth: o.dateOfBirth ?? null,
          gender: o.gender ?? null,
          nationality: o.nationality ?? 'Indian',
          primaryPhone: o.primaryPhone ?? lead.phone,
          alternatePhone: o.alternatePhone ?? null,
          email: o.email ?? lead.email ?? null,
          addressLine1: o.addressLine1 ?? null,
          addressLine2: o.addressLine2 ?? null,
          city: o.city ?? null,
          state: o.state ?? null,
          postalCode: o.postalCode ?? null,
          country: o.country ?? 'India',
          // The executive who worked the lead keeps the relationship.
          ownerId: o.ownerId ?? lead.assignedToId ?? viewer.id,
          notes: o.notes ?? null,
          lastActivityAt: new Date().toISOString().slice(0, 10),
        })
        .returning({ id: customers.id });

      if (!newCustomer) throw new Error('Customer insert returned no row');
      customerId = newCustomer.id;
      created = true;
    }

    await tx
      .update(leads)
      .set({
        customerId,
        status: 'CONVERTED',
        convertedAt: new Date(),
        // A converted lead has no outstanding follow-up of its own.
        nextFollowupAt: null,
      })
      .where(eq(leads.id, leadId));

    await tx.insert(leadStatusHistory).values({
      leadId,
      fromStatus: lead.status,
      toStatus: 'CONVERTED',
      reason: input.notes ?? null,
      changedById: viewer.id,
    });

    // Carry the lead's history across so it is visible on the customer too.
    // The rows keep their lead link; they gain a customer link.
    await tx
      .update(followups)
      .set({ customerId })
      .where(and(eq(followups.leadId, leadId), isNull(followups.customerId)));

    await tx
      .update(notes)
      .set({ customerId })
      .where(and(eq(notes.leadId, leadId), isNull(notes.customerId)));

    await tx
      .update(documents)
      .set({ customerId })
      .where(
        and(
          eq(documents.entityType, 'lead'),
          eq(documents.entityId, leadId),
          isNull(documents.customerId),
        ),
      );

    // Any follow-up still open moves with the customer rather than being closed.
    await tx
      .update(customers)
      .set({ lastActivityAt: sql`current_date` })
      .where(eq(customers.id, customerId));

    await recordAudit(
      {
        ...ctx,
        action: 'lead.converted',
        entityType: 'lead',
        entityId: leadId,
        entityCode: lead.leadCode,
        before: { status: lead.status, customerId: lead.customerId },
        after: { status: 'CONVERTED', customerId },
        summary: created
          ? `Enquiry ${lead.leadCode} converted to new customer ${customerCode}`
          : `Enquiry ${lead.leadCode} linked to existing customer ${customerCode}`,
      },
      tx,
    );

    if (created) {
      await recordAudit(
        {
          ...ctx,
          action: 'customer.created',
          entityType: 'customer',
          entityId: customerId,
          entityCode: customerCode,
          summary: `Customer ${customerCode} created from enquiry ${lead.leadCode}`,
        },
        tx,
      );
    }

    return { customerId, customerCode, createdCustomer: created, leadCode: lead.leadCode };
  });
}
