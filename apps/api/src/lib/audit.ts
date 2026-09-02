import type { FastifyRequest } from 'fastify';
import type { Db, Transaction } from '../db/client.js';
import { db as defaultDb } from '../db/client.js';
import { auditLogs } from '../db/schema/system.js';

/** Field names never written to the audit trail, whatever the caller passes. */
const NEVER_AUDIT = new Set([
  'password',
  'passwordHash',
  'newPassword',
  'currentPassword',
  'mfaSecret',
  'tokenHash',
  'passportNumber',
  'passportNumberHash',
  'visaNumber',
]);

export interface AuditContext {
  actorId?: string | null;
  actorEmail?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface AuditEntry extends AuditContext {
  action: string;
  entityType: string;
  entityId?: string | null;
  entityCode?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  summary?: string;
}

function redact(obj: Record<string, unknown> | null | undefined) {
  if (!obj) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (NEVER_AUDIT.has(k)) continue;
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Field-level diff so the log stores what changed, not two full snapshots. */
function diff(before?: Record<string, unknown>, after?: Record<string, unknown>) {
  if (!before || !after) return undefined;
  const changed = Object.keys(after).filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  );
  return changed.length > 0 ? changed : undefined;
}

/**
 * Writes one audit row. Pass the transaction when auditing alongside a business
 * write so the two commit or roll back together — an audit entry for a change
 * that was rolled back is worse than no entry at all.
 */
export async function recordAudit(
  entry: AuditEntry,
  tx: Db | Transaction = defaultDb,
): Promise<void> {
  const before = redact(entry.before);
  const after = redact(entry.after);

  await tx.insert(auditLogs).values({
    actorId: entry.actorId ?? null,
    actorEmail: entry.actorEmail ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    entityCode: entry.entityCode ?? null,
    changedFields: diff(before, after) ?? null,
    oldValues: before ?? null,
    newValues: after ?? null,
    summary: entry.summary ?? null,
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ?? null,
    requestId: entry.requestId ?? null,
  });
}

/** Pulls actor and request metadata off the request so callers cannot forget it. */
export function auditContext(req: FastifyRequest): AuditContext {
  return {
    actorId: req.currentUser?.id ?? null,
    actorEmail: req.currentUser?.email ?? null,
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    requestId: req.id,
  };
}
