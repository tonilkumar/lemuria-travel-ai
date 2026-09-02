import {
  assignLeadSchema,
  createLeadSchema,
  leadListQuerySchema,
  updateLeadSchema,
} from '@lemuria/shared';
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { users } from '../../db/schema/auth.js';
import { followups, leadAssignments, leads, leadScores, leadStatusHistory, notes } from '../../db/schema/leads.js';
import { auditContext, recordAudit } from '../../lib/audit.js';
import { ok, paginated } from '../../lib/reply.js';
import { requireUser } from '../../plugins/auth.js';
import { findDuplicates } from './duplicate.service.js';
import * as leadService from './lead.service.js';

const idParam = z.object({ id: z.string().uuid() });

export async function leadRoutes(app: FastifyInstance): Promise<void> {
  // Every route in this plugin requires a signed-in user.
  app.addHook('preHandler', app.authenticate);

  app.get('/', { preHandler: [app.authorize('lead.read')] }, async (req) => {
    const query = leadListQuerySchema.parse(req.query);
    const { rows, total } = await leadService.listLeads(query, requireUser(req));
    return paginated(rows, query.page, query.pageSize, total);
  });

  app.get('/summary', { preHandler: [app.authorize('lead.read')] }, async (req) => {
    const query = leadListQuerySchema.parse(req.query);
    return ok(await leadService.leadSummary(query, requireUser(req)));
  });

  /**
   * Duplicate pre-check. The Quick Enquiry form calls this while the user types
   * so the warning appears before they hit save, not after.
   */
  app.post('/check-duplicates', { preHandler: [app.authorize('lead.create')] }, async (req) => {
    const input = z
      .object({
        customerName: z.string().min(1),
        phone: z.string().min(4),
        email: z.string().email().optional().or(z.literal('')),
      })
      .parse(req.body);

    return ok(
      await findDuplicates({
        name: input.customerName,
        phone: input.phone,
        email: input.email || undefined,
      }),
    );
  });

  app.post('/', { preHandler: [app.authorize('lead.create')] }, async (req, reply) => {
    const input = createLeadSchema.parse(req.body);
    const created = await leadService.createLead(input, requireUser(req), auditContext(req));
    reply.status(201);
    return ok(created);
  });

  app.get('/:id', { preHandler: [app.authorize('lead.read')] }, async (req) => {
    const { id } = idParam.parse(req.params);
    return ok(await leadService.getLead(id, requireUser(req)));
  });

  app.patch('/:id', { preHandler: [app.authorize('lead.update')] }, async (req) => {
    const { id } = idParam.parse(req.params);
    const input = updateLeadSchema.parse(req.body);
    const updated = await leadService.updateLead(id, input, requireUser(req), auditContext(req));
    // Status and requirement changes move the score; keep it current.
    await leadService.rescoreLead(id, requireUser(req));
    return ok(updated);
  });

  app.post('/:id/assign', { preHandler: [app.authorize('lead.assign')] }, async (req) => {
    const { id } = idParam.parse(req.params);
    const input = assignLeadSchema.parse(req.body);
    return ok(
      await leadService.assignLead(
        id,
        input.assignedToId,
        input.reason,
        requireUser(req),
        auditContext(req),
      ),
    );
  });

  app.post('/:id/score', { preHandler: [app.authorize('lead.score')] }, async (req) => {
    const { id } = idParam.parse(req.params);
    const viewer = requireUser(req);
    await leadService.getLead(id, viewer); // visibility check
    await leadService.rescoreLead(id, viewer);
    return ok(await leadService.getLead(id, viewer));
  });

  /** Score history, so a manager can see why a lead was Hot last week. */
  app.get('/:id/scores', { preHandler: [app.authorize('lead.read')] }, async (req) => {
    const { id } = idParam.parse(req.params);
    await leadService.getLead(id, requireUser(req));
    return ok(
      await db
        .select()
        .from(leadScores)
        .where(eq(leadScores.leadId, id))
        .orderBy(desc(leadScores.createdAt))
        .limit(20),
    );
  });

  /**
   * Unified activity timeline: status changes, assignments, follow-ups and
   * notes merged into one chronological list (spec §10).
   */
  app.get('/:id/timeline', { preHandler: [app.authorize('lead.read')] }, async (req) => {
    const { id } = idParam.parse(req.params);
    await leadService.getLead(id, requireUser(req));

    const [statusRows, assignmentRows, followupRows, noteRows] = await Promise.all([
      db
        .select({
          at: leadStatusHistory.createdAt,
          fromStatus: leadStatusHistory.fromStatus,
          toStatus: leadStatusHistory.toStatus,
          reason: leadStatusHistory.reason,
          actor: users.fullName,
        })
        .from(leadStatusHistory)
        .leftJoin(users, eq(users.id, leadStatusHistory.changedById))
        .where(eq(leadStatusHistory.leadId, id)),
      db
        .select({
          at: leadAssignments.createdAt,
          toUserId: leadAssignments.toUserId,
          reason: leadAssignments.reason,
          actor: users.fullName,
        })
        .from(leadAssignments)
        .leftJoin(users, eq(users.id, leadAssignments.assignedById))
        .where(eq(leadAssignments.leadId, id)),
      db
        .select({
          at: followups.createdAt,
          type: followups.type,
          status: followups.status,
          dueAt: followups.dueAt,
          description: followups.description,
          outcome: followups.outcome,
        })
        .from(followups)
        .where(eq(followups.leadId, id)),
      db
        .select({ at: notes.createdAt, body: notes.body, actor: users.fullName })
        .from(notes)
        .leftJoin(users, eq(users.id, notes.createdById))
        .where(eq(notes.leadId, id)),
    ]);

    const timeline = [
      ...statusRows.map((r) => ({ kind: 'STATUS' as const, ...r })),
      ...assignmentRows.map((r) => ({ kind: 'ASSIGNMENT' as const, ...r })),
      ...followupRows.map((r) => ({ kind: 'FOLLOWUP' as const, ...r })),
      ...noteRows.map((r) => ({ kind: 'NOTE' as const, ...r })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());

    return ok(timeline);
  });

  app.post('/:id/notes', { preHandler: [app.authorize('lead.update')] }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { body } = z.object({ body: z.string().trim().min(1).max(4000) }).parse(req.body);
    const viewer = requireUser(req);
    await leadService.getLead(id, viewer);

    const [created] = await db
      .insert(notes)
      .values({ leadId: id, body, createdById: viewer.id })
      .returning();

    reply.status(201);
    return ok(created);
  });

  app.delete('/:id', { preHandler: [app.authorize('lead.delete')] }, async (req) => {
    const { id } = idParam.parse(req.params);
    const viewer = requireUser(req);
    const existing = await leadService.getLead(id, viewer);

    // Soft delete only — the audit trail must stay resolvable.
    await db.update(leads).set({ deletedAt: new Date() }).where(eq(leads.id, id));

    await recordAudit({
      ...auditContext(req),
      action: 'lead.deleted',
      entityType: 'lead',
      entityId: id,
      entityCode: existing.lead.leadCode,
      summary: `Enquiry ${existing.lead.leadCode} deleted`,
    });

    return ok({ deleted: true });
  });
}
