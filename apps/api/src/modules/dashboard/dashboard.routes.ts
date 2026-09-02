import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok } from '../../lib/reply.js';
import { requireUser } from '../../plugins/auth.js';
import * as dashboard from './dashboard.service.js';

const windowQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

const rangeQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.authorize('dashboard.read'));

  app.get('/kpis', async (req) => ok(await dashboard.kpis(requireUser(req))));

  app.get('/funnel', async (req) => {
    const { days } = windowQuery.parse(req.query);
    return ok(await dashboard.funnel(requireUser(req), days));
  });

  app.get('/lead-sources', async (req) => {
    const { days } = windowQuery.parse(req.query);
    return ok(await dashboard.leadSourceBreakdown(requireUser(req), days));
  });

  app.get('/revenue-trend', async (req) => {
    const { from, to } = rangeQuery.parse(req.query);
    return ok(await dashboard.revenueTrend(from, to));
  });

  app.get('/recent-enquiries', async (req) => {
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(25).default(8) })
      .parse(req.query);
    return ok(await dashboard.recentEnquiries(requireUser(req), limit));
  });

  app.get('/visa-cases', async () => ok(await dashboard.activeVisaCases()));

  app.get('/at-a-glance', async () => ok(await dashboard.atAGlance()));
}
