import {
  completeFollowupSchema,
  createFollowupSchema,
  followupListQuerySchema,
} from '@lemuria/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { auditContext } from '../../lib/audit.js';
import { ok, paginated } from '../../lib/reply.js';
import { requireUser } from '../../plugins/auth.js';
import * as followupService from './followup.service.js';

const idParam = z.object({ id: z.string().uuid() });

export async function followupRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  app.get('/', { preHandler: [app.authorize('followup.read')] }, async (req) => {
    const query = followupListQuerySchema.parse(req.query);
    const statuses = query.status
      ? Array.isArray(query.status)
        ? query.status
        : [query.status]
      : undefined;

    const { rows, total } = await followupService.listFollowups(
      {
        page: query.page,
        pageSize: query.pageSize,
        bucket: query.bucket,
        assignedToId: query.assignedToId,
        mine: query.mine,
        status: statuses,
      },
      requireUser(req),
    );
    return paginated(rows, query.page, query.pageSize, total);
  });

  app.get('/buckets', { preHandler: [app.authorize('followup.read')] }, async (req) => {
    const { scope } = z
      .object({ scope: z.enum(['me', 'team', 'auto']).default('auto') })
      .parse(req.query);
    const viewer = requireUser(req);

    // 'auto' mirrors the visibility rule the follow-up list uses, so a tab
    // count always describes the rows that tab actually shows.
    const scopeToSelf =
      scope === 'me' ? true : scope === 'team' ? false : !viewer.permissions.includes('lead.read.all');

    return ok(await followupService.followupBuckets(viewer, scopeToSelf));
  });

  app.post('/', { preHandler: [app.authorize('followup.create')] }, async (req, reply) => {
    const input = createFollowupSchema.parse(req.body);
    const created = await followupService.createFollowup(input, requireUser(req), auditContext(req));
    reply.status(201);
    return ok(created);
  });

  app.post('/:id/complete', { preHandler: [app.authorize('followup.complete')] }, async (req) => {
    const { id } = idParam.parse(req.params);
    const input = completeFollowupSchema.parse(req.body ?? {});
    const result = await followupService.completeFollowup(
      id,
      {
        outcome: input.outcome,
        nextFollowup: input.nextFollowup
          ? {
              type: input.nextFollowup.type,
              priority: input.nextFollowup.priority,
              dueAt: input.nextFollowup.dueAt,
              description: input.nextFollowup.description,
            }
          : undefined,
      },
      requireUser(req),
      auditContext(req),
    );
    return ok(result);
  });
}
