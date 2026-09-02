import {
  convertLeadSchema,
  createCustomerSchema,
  customerListQuerySchema,
  customerPreferencesSchema,
  passportSchema,
  updateCustomerSchema,
} from '@lemuria/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { customers } from '../../db/schema/customers.js';
import { notes } from '../../db/schema/leads.js';
import { auditContext, recordAudit } from '../../lib/audit.js';
import { ok, paginated } from '../../lib/reply.js';
import { requireUser } from '../../plugins/auth.js';
import { findDuplicates } from '../leads/duplicate.service.js';
import { convertLead } from './conversion.service.js';
import * as customerService from './customer.service.js';

const idParam = z.object({ id: z.string().uuid() });

export async function customerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  app.get('/', { preHandler: [app.authorize('customer.read')] }, async (req) => {
    const query = customerListQuerySchema.parse(req.query);
    const { rows, total } = await customerService.listCustomers(query, requireUser(req));
    return paginated(rows, query.page, query.pageSize, total);
  });

  app.get('/summary', { preHandler: [app.authorize('customer.read')] }, async (req) => {
    const query = customerListQuerySchema.parse(req.query);
    return ok(await customerService.customerSummary(query, requireUser(req)));
  });

  app.post('/check-duplicates', { preHandler: [app.authorize('customer.create')] }, async (req) => {
    const input = z
      .object({
        fullName: z.string().min(1),
        phone: z.string().min(4),
        email: z.string().email().optional().or(z.literal('')),
      })
      .parse(req.body);

    return ok(
      await findDuplicates({
        name: input.fullName,
        phone: input.phone,
        email: input.email || undefined,
      }),
    );
  });

  app.post('/', { preHandler: [app.authorize('customer.create')] }, async (req, reply) => {
    const input = createCustomerSchema.parse(req.body);
    const created = await customerService.createCustomer(input, requireUser(req), auditContext(req));
    reply.status(201);
    return ok(created);
  });

  /** The 360 profile. */
  app.get('/:id', { preHandler: [app.authorize('customer.read')] }, async (req) => {
    const { id } = idParam.parse(req.params);
    return ok(await customerService.getCustomer(id, requireUser(req)));
  });

  app.patch('/:id', { preHandler: [app.authorize('customer.update')] }, async (req) => {
    const { id } = idParam.parse(req.params);
    const input = updateCustomerSchema.parse(req.body);
    return ok(await customerService.updateCustomer(id, input, auditContext(req)));
  });

  app.get('/:id/timeline', { preHandler: [app.authorize('customer.read')] }, async (req) => {
    const { id } = idParam.parse(req.params);
    return ok(await customerService.customerTimeline(id, requireUser(req)));
  });

  app.put('/:id/preferences', { preHandler: [app.authorize('customer.update')] }, async (req) => {
    const { id } = idParam.parse(req.params);
    const input = customerPreferencesSchema.parse(req.body);
    return ok(await customerService.upsertPreferences(id, input, auditContext(req)));
  });

  /**
   * Recording a passport is gated behind sensitive-document access, not plain
   * customer.update — the number itself is identity data.
   */
  app.post(
    '/:id/passports',
    { preHandler: [app.authorize('customer.update', 'document.read.sensitive')] },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const input = passportSchema.parse(req.body);
      const saved = await customerService.addPassport(id, input, auditContext(req));
      reply.status(201);
      return ok(saved);
    },
  );

  app.post('/:id/notes', { preHandler: [app.authorize('customer.update')] }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { body } = z.object({ body: z.string().trim().min(1).max(4000) }).parse(req.body);
    const viewer = requireUser(req);
    await customerService.getCustomer(id, viewer);

    const [created] = await db
      .insert(notes)
      .values({ customerId: id, body, createdById: viewer.id })
      .returning();

    reply.status(201);
    return ok(created);
  });

  app.post('/:id/recalculate', { preHandler: [app.authorize('customer.update')] }, async (req) => {
    const { id } = idParam.parse(req.params);
    await customerService.refreshCustomerStanding(id);
    return ok(await customerService.getCustomer(id, requireUser(req)));
  });

  app.delete('/:id', { preHandler: [app.authorize('customer.delete')] }, async (req) => {
    const { id } = idParam.parse(req.params);
    const viewer = requireUser(req);
    const existing = await customerService.getCustomer(id, viewer);

    // Soft delete only — bookings, payments and the audit trail must stay
    // resolvable to the customer they belong to.
    await db
      .update(customers)
      .set({ deletedAt: new Date(), isActive: false })
      .where(eq(customers.id, id));

    await recordAudit({
      ...auditContext(req),
      action: 'customer.deleted',
      entityType: 'customer',
      entityId: id,
      entityCode: existing.customer.customerCode,
      summary: `Customer ${existing.customer.customerCode} deleted`,
    });

    return ok({ deleted: true });
  });
}

/** Mounted under /leads/:id/convert so the action sits with the lead it acts on. */
export async function leadConversionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  app.post(
    '/:id/convert',
    { preHandler: [app.authorize('lead.convert', 'customer.create')] },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const input = convertLeadSchema.parse(req.body ?? {});
      return ok(await convertLead(id, input, requireUser(req), auditContext(req)));
    },
  );
}
