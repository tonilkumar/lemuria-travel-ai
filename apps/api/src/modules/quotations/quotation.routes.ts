import {
  approveQuotationSchema,
  createQuotationSchema,
  generateQuotationContentSchema,
  quotationListQuerySchema,
  sendQuotationSchema,
  updateVersionContentSchema,
  upsertPackageSchema,
} from '@lemuria/shared';
import { asc, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { taxRates } from '../../db/schema/masterdata.js';
import { auditContext } from '../../lib/audit.js';
import { ok, paginated } from '../../lib/reply.js';
import { requireUser } from '../../plugins/auth.js';
import * as aiContent from './ai-content.service.js';
import { buildPdfData } from './pdf.service.js';
import * as quotationService from './quotation.service.js';
import { renderQuotationPdf } from './quotation-pdf.js';
import * as workflow from './workflow.service.js';

const idParam = z.object({ id: z.string().uuid() });
const versionParam = z.object({ versionId: z.string().uuid() });

export async function quotationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  app.get('/', { preHandler: [app.authorize('quotation.read')] }, async (req) => {
    const query = quotationListQuerySchema.parse(req.query);
    const { rows, total } = await quotationService.listQuotations(query, requireUser(req));
    return paginated(rows, query.page, query.pageSize, total);
  });

  app.get('/summary', { preHandler: [app.authorize('quotation.read')] }, async (req) =>
    ok(await quotationService.quotationSummary(requireUser(req))),
  );

  /** Tax rates, so the builder can show what treatment is being applied. */
  app.get('/tax-rates', { preHandler: [app.authorize('quotation.read')] }, async () =>
    ok(
      await db
        .select({
          id: taxRates.id,
          serviceCategory: taxRates.serviceCategory,
          name: taxRates.name,
          rateBps: taxRates.rateBps,
          basis: taxRates.basis,
          inputCreditAllowed: taxRates.inputCreditAllowed,
          isProvisional: taxRates.isProvisional,
          authorityNote: taxRates.authorityNote,
        })
        .from(taxRates)
        .where(isNull(taxRates.deletedAt))
        .orderBy(asc(taxRates.serviceCategory), asc(taxRates.name)),
    ),
  );

  app.post('/', { preHandler: [app.authorize('quotation.create')] }, async (req, reply) => {
    const input = createQuotationSchema.parse(req.body);
    const created = await quotationService.createQuotation(
      input,
      requireUser(req),
      auditContext(req),
    );
    reply.status(201);
    return ok(created);
  });

  app.get('/:id', { preHandler: [app.authorize('quotation.read')] }, async (req) => {
    const { id } = idParam.parse(req.params);
    return ok(await quotationService.getQuotation(id, requireUser(req)));
  });

  app.post('/:id/versions', { preHandler: [app.authorize('quotation.update')] }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const version = await quotationService.createVersion(id, requireUser(req), auditContext(req));
    reply.status(201);
    return ok(version);
  });

  // ── Version editing ────────────────────────────────────────────────────────

  app.put(
    '/versions/:versionId/packages',
    { preHandler: [app.authorize('quotation.update')] },
    async (req) => {
      const { versionId } = versionParam.parse(req.params);
      const input = upsertPackageSchema.parse(req.body);
      return ok(
        await quotationService.upsertPackage(versionId, input, requireUser(req), auditContext(req)),
      );
    },
  );

  app.delete(
    '/versions/:versionId/packages/:packageId',
    { preHandler: [app.authorize('quotation.update')] },
    async (req) => {
      const { versionId, packageId } = z
        .object({ versionId: z.string().uuid(), packageId: z.string().uuid() })
        .parse(req.params);
      await quotationService.deletePackage(versionId, packageId, auditContext(req));
      return ok({ deleted: true });
    },
  );

  app.patch(
    '/versions/:versionId/content',
    { preHandler: [app.authorize('quotation.update')] },
    async (req) => {
      const { versionId } = versionParam.parse(req.params);
      const input = updateVersionContentSchema.parse(req.body);
      return ok(await quotationService.updateVersionContent(versionId, input, auditContext(req)));
    },
  );

  // ── Workflow ───────────────────────────────────────────────────────────────

  app.post(
    '/versions/:versionId/submit',
    { preHandler: [app.authorize('quotation.update')] },
    async (req) => {
      const { versionId } = versionParam.parse(req.params);
      return ok(await workflow.submitForApproval(versionId, requireUser(req), auditContext(req)));
    },
  );

  app.post(
    '/versions/:versionId/decision',
    { preHandler: [app.authorize('quotation.approve')] },
    async (req) => {
      const { versionId } = versionParam.parse(req.params);
      const input = approveQuotationSchema.parse(req.body);
      return ok(
        await workflow.decideApproval(
          versionId,
          input.decision,
          input.comments,
          requireUser(req),
          auditContext(req),
        ),
      );
    },
  );

  app.post(
    '/versions/:versionId/send',
    { preHandler: [app.authorize('quotation.send')] },
    async (req) => {
      const { versionId } = versionParam.parse(req.params);
      const input = sendQuotationSchema.parse(req.body ?? {});
      return ok(await workflow.sendQuotation(versionId, input.channel, input.note, auditContext(req)));
    },
  );

  app.post(
    '/versions/:versionId/outcome',
    { preHandler: [app.authorize('quotation.update')] },
    async (req) => {
      const { versionId } = versionParam.parse(req.params);
      const input = z
        .object({
          outcome: z.enum(['ACCEPTED', 'DECLINED']),
          reason: z.string().trim().max(1000).optional(),
        })
        .parse(req.body);
      return ok(
        await workflow.recordOutcome(versionId, input.outcome, input.reason, auditContext(req)),
      );
    },
  );

  // ── AI drafting ────────────────────────────────────────────────────────────

  app.post(
    '/versions/:versionId/ai/draft',
    { preHandler: [app.authorize('quotation.update', 'ai.use')] },
    async (req) => {
      const { versionId } = versionParam.parse(req.params);
      const input = generateQuotationContentSchema.parse(req.body);
      return ok(
        await aiContent.generateContent(versionId, input, requireUser(req), auditContext(req)),
      );
    },
  );

  /**
   * The only route that turns an AI draft into customer-facing copy. Requires
   * ai.approve, which an executive does not hold (spec §24).
   */
  app.post(
    '/ai/drafts/:generationId/review',
    { preHandler: [app.authorize('ai.approve')] },
    async (req) => {
      const { generationId } = z.object({ generationId: z.string().uuid() }).parse(req.params);
      const input = z
        .object({
          decision: z.enum(['APPROVE', 'REJECT']),
          editedText: z.string().max(8000).optional(),
          reason: z.string().trim().max(1000).optional(),
        })
        .parse(req.body);

      return ok(
        await aiContent.reviewDraft(
          generationId,
          input.decision,
          input.editedText,
          input.reason,
          requireUser(req),
          auditContext(req),
        ),
      );
    },
  );

  app.get(
    '/versions/:versionId/ai/drafts',
    { preHandler: [app.authorize('quotation.read')] },
    async (req) => {
      const { versionId } = versionParam.parse(req.params);
      return ok(await aiContent.draftHistory(versionId));
    },
  );

  // ── PDF ────────────────────────────────────────────────────────────────────

  app.get(
    '/versions/:versionId/pdf',
    { preHandler: [app.authorize('quotation.read')] },
    async (req, reply) => {
      const { versionId } = versionParam.parse(req.params);
      const data = await buildPdfData(versionId);
      const buffer = await renderQuotationPdf(data);

      const safeName = `${data.quotationCode}-v${data.versionNumber}.pdf`;

      reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Length', String(buffer.byteLength))
        // Inline so the executive can check it before sending, rather than
        // downloading a file just to look at it.
        .header('Content-Disposition', `inline; filename="${safeName}"`)
        .header('Cache-Control', 'private, no-store')
        .header('X-Content-Type-Options', 'nosniff');

      return reply.send(buffer);
    },
  );
}
