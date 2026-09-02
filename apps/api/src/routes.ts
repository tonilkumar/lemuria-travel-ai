import type { FastifyInstance } from 'fastify';
import { authRoutes } from './modules/auth/auth.routes.js';
import { customerRoutes, leadConversionRoutes } from './modules/customers/customer.routes.js';
import { documentRoutes } from './modules/documents/document.routes.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { followupRoutes } from './modules/leads/followup.routes.js';
import { leadRoutes } from './modules/leads/lead.routes.js';
import { masterDataRoutes } from './modules/masterdata/masterdata.routes.js';
import { quotationRoutes } from './modules/quotations/quotation.routes.js';
import { userRoutes } from './modules/users/user.routes.js';

/** Every module mounts here; the prefix /api/v1 is applied by the caller. */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(userRoutes, { prefix: '/users' });
  await app.register(masterDataRoutes, { prefix: '/master-data' });
  await app.register(leadRoutes, { prefix: '/leads' });
  await app.register(leadConversionRoutes, { prefix: '/leads' });
  await app.register(customerRoutes, { prefix: '/customers' });
  await app.register(documentRoutes, { prefix: '/documents' });
  await app.register(quotationRoutes, { prefix: '/quotations' });
  await app.register(followupRoutes, { prefix: '/followups' });
  await app.register(dashboardRoutes, { prefix: '/dashboard' });
}
