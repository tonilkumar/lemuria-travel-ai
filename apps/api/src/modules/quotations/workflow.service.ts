import type { AuthenticatedUser } from '@lemuria/shared';
import { canTransitionQuotation } from '@lemuria/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { leads } from '../../db/schema/leads.js';
import {
  quotationApprovals,
  quotationPackages,
  quotations,
  quotationVersions,
} from '../../db/schema/quotations.js';
import { recordAudit, type AuditContext } from '../../lib/audit.js';
import { badRequest, conflict, forbidden, invalidTransition, notFound } from '../../lib/errors.js';
import { approvalRules, recalculateVersion } from './quotation.service.js';

async function loadVersion(versionId: string) {
  const [row] = await db
    .select({
      version: quotationVersions,
      quotation: quotations,
    })
    .from(quotationVersions)
    .innerJoin(quotations, eq(quotations.id, quotationVersions.quotationId))
    .where(and(eq(quotationVersions.id, versionId), isNull(quotations.deletedAt)))
    .limit(1);

  if (!row) throw notFound('Quotation version');
  return row;
}

/**
 * Moves a draft towards being sendable.
 *
 * Recalculates first — the thresholds may have changed since the last edit, and
 * a version must never be approved against stale figures. If the recalculated
 * version trips no rule it goes straight to APPROVED; otherwise it parks in
 * PENDING_APPROVAL with the reasons recorded.
 */
export async function submitForApproval(
  versionId: string,
  viewer: AuthenticatedUser,
  ctx: AuditContext,
) {
  const { version, quotation } = await loadVersion(versionId);

  if (!canTransitionQuotation(version.status, 'PENDING_APPROVAL')) {
    throw invalidTransition(
      `A ${version.status.toLowerCase().replace(/_/g, ' ')} version cannot be submitted for approval.`,
      { status: version.status },
    );
  }

  const packageCount = await db.$count(quotationPackages, eq(quotationPackages.versionId, versionId));
  if (packageCount === 0) {
    throw badRequest('Add at least one package before submitting this quotation.');
  }

  const rules = await approvalRules();

  return db.transaction(async (tx) => {
    await recalculateVersion(tx, versionId, rules);

    const [fresh] = await tx
      .select()
      .from(quotationVersions)
      .where(eq(quotationVersions.id, versionId))
      .limit(1);

    if (!fresh) throw notFound('Quotation version');

    const triggers = fresh.approvalTriggers ?? [];
    const needsApproval = triggers.length > 0;
    const nextStatus = needsApproval ? 'PENDING_APPROVAL' : 'APPROVED';

    await tx
      .update(quotationVersions)
      .set({ status: nextStatus })
      .where(eq(quotationVersions.id, versionId));

    await tx
      .update(quotations)
      .set({ status: nextStatus })
      .where(eq(quotations.id, quotation.id));

    if (needsApproval) {
      await tx.insert(quotationApprovals).values({
        versionId,
        requestedById: viewer.id,
        decision: 'PENDING',
        triggerReason: triggers.join(','),
      });
    }

    await recordAudit(
      {
        ...ctx,
        action: needsApproval ? 'quotation.approval_requested' : 'quotation.auto_approved',
        entityType: 'quotation',
        entityId: quotation.id,
        entityCode: quotation.quotationCode,
        before: { status: version.status },
        after: { status: nextStatus, triggers },
        summary: needsApproval
          ? `V${fresh.versionNumber} needs approval: ${triggers.join(', ').toLowerCase().replace(/_/g, ' ')}`
          : `V${fresh.versionNumber} cleared without approval`,
      },
      tx,
    );

    return { status: nextStatus, triggers, needsApproval };
  });
}

/**
 * A manager's decision.
 *
 * Deliberately cannot be made by whoever requested it: self-approval would make
 * the whole threshold mechanism decorative.
 */
export async function decideApproval(
  versionId: string,
  decision: 'APPROVED' | 'REJECTED',
  comments: string | undefined,
  viewer: AuthenticatedUser,
  ctx: AuditContext,
) {
  const { version, quotation } = await loadVersion(versionId);

  if (version.status !== 'PENDING_APPROVAL') {
    throw invalidTransition('This version is not awaiting approval.', { status: version.status });
  }

  const [pending] = await db
    .select()
    .from(quotationApprovals)
    .where(and(eq(quotationApprovals.versionId, versionId), eq(quotationApprovals.decision, 'PENDING')))
    .orderBy(desc(quotationApprovals.createdAt))
    .limit(1);

  if (!pending) throw conflict('There is no open approval request for this version.');

  if (pending.requestedById === viewer.id) {
    throw forbidden('A quotation cannot be approved by the person who submitted it.');
  }

  if (decision === 'REJECTED' && !comments?.trim()) {
    throw badRequest('Explain what needs to change before rejecting.');
  }

  return db.transaction(async (tx) => {
    await tx
      .update(quotationApprovals)
      .set({
        decision,
        decidedById: viewer.id,
        decidedAt: new Date(),
        comments: comments ?? null,
      })
      .where(eq(quotationApprovals.id, pending.id));

    // A rejected version returns to DRAFT so it can be reworked; the rejection
    // stays on the record.
    const nextStatus = decision === 'APPROVED' ? 'APPROVED' : 'DRAFT';

    await tx
      .update(quotationVersions)
      .set({ status: nextStatus })
      .where(eq(quotationVersions.id, versionId));

    await tx.update(quotations).set({ status: nextStatus }).where(eq(quotations.id, quotation.id));

    await recordAudit(
      {
        ...ctx,
        action: decision === 'APPROVED' ? 'quotation.approved' : 'quotation.rejected',
        entityType: 'quotation',
        entityId: quotation.id,
        entityCode: quotation.quotationCode,
        before: { status: 'PENDING_APPROVAL' },
        after: { status: nextStatus },
        summary:
          decision === 'APPROVED'
            ? `V${version.versionNumber} approved`
            : `V${version.versionNumber} rejected: ${comments}`,
      },
      tx,
    );

    return { status: nextStatus, decision };
  });
}

/**
 * Marks a version sent.
 *
 * Refuses anything not APPROVED. That is the whole point of the workflow: a
 * discounted or high-value quote cannot reach a customer by being clicked past.
 * Sending also freezes the version — changing the price now means a new one.
 */
export async function sendQuotation(
  versionId: string,
  channel: string,
  note: string | undefined,
  ctx: AuditContext,
) {
  const { version, quotation } = await loadVersion(versionId);

  if (version.status !== 'APPROVED') {
    throw invalidTransition(
      version.status === 'PENDING_APPROVAL'
        ? 'This quotation is still waiting on a manager.'
        : 'Submit this quotation for approval before sending it.',
      { status: version.status },
    );
  }

  return db.transaction(async (tx) => {
    await tx
      .update(quotationVersions)
      .set({ status: 'SENT', sentAt: new Date() })
      .where(eq(quotationVersions.id, versionId));

    await tx.update(quotations).set({ status: 'SENT' }).where(eq(quotations.id, quotation.id));

    // A quotation going out is a real event on the lead's timeline.
    if (quotation.leadId) {
      await tx
        .update(leads)
        .set({
          status: 'QUOTATION_SENT',
          lastContactAt: new Date(),
          lastContactChannel: channel,
        })
        .where(and(eq(leads.id, quotation.leadId), eq(leads.status, 'IN_PROGRESS')));
    }

    await recordAudit(
      {
        ...ctx,
        action: 'quotation.sent',
        entityType: 'quotation',
        entityId: quotation.id,
        entityCode: quotation.quotationCode,
        before: { status: 'APPROVED' },
        after: { status: 'SENT', channel },
        summary: `V${version.versionNumber} sent via ${channel.toLowerCase()}${note ? ` — ${note}` : ''}`,
      },
      tx,
    );

    return { status: 'SENT' as const, sentAt: new Date().toISOString() };
  });
}

/** Records the customer's answer to a sent quotation. */
export async function recordOutcome(
  versionId: string,
  outcome: 'ACCEPTED' | 'DECLINED',
  reason: string | undefined,
  ctx: AuditContext,
) {
  const { version, quotation } = await loadVersion(versionId);

  if (!canTransitionQuotation(version.status, outcome)) {
    throw invalidTransition(`A ${version.status.toLowerCase()} quotation has no outcome to record.`, {
      status: version.status,
    });
  }

  return db.transaction(async (tx) => {
    await tx
      .update(quotationVersions)
      .set({ status: outcome })
      .where(eq(quotationVersions.id, versionId));

    await tx.update(quotations).set({ status: outcome }).where(eq(quotations.id, quotation.id));

    await recordAudit(
      {
        ...ctx,
        action: outcome === 'ACCEPTED' ? 'quotation.accepted' : 'quotation.declined',
        entityType: 'quotation',
        entityId: quotation.id,
        entityCode: quotation.quotationCode,
        after: { status: outcome },
        summary: `V${version.versionNumber} ${outcome.toLowerCase()}${reason ? ` — ${reason}` : ''}`,
      },
      tx,
    );

    return { status: outcome };
  });
}
