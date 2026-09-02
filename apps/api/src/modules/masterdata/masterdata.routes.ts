import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/client.js';
import {
  destinations,
  leadSources,
  paymentMethods,
  supplierTypes,
  travelTypes,
  visaCountries,
} from '../../db/schema/masterdata.js';
import { ok } from '../../lib/reply.js';

/**
 * Read endpoints for business configuration. Every dropdown in the UI is fed
 * from here rather than from a hardcoded frontend array, so an admin can add a
 * lead source or travel type without a release (spec §40).
 */
export async function masterDataRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  app.get('/lead-sources', { preHandler: [app.authorize('masterdata.read')] }, async () =>
    ok(
      await db
        .select({
          id: leadSources.id,
          key: leadSources.key,
          name: leadSources.name,
          colour: leadSources.colour,
          icon: leadSources.icon,
        })
        .from(leadSources)
        .where(eq(leadSources.isActive, true))
        .orderBy(asc(leadSources.sortOrder), asc(leadSources.name)),
    ),
  );

  app.get('/travel-types', { preHandler: [app.authorize('masterdata.read')] }, async () =>
    ok(
      await db
        .select({ id: travelTypes.id, key: travelTypes.key, name: travelTypes.name })
        .from(travelTypes)
        .where(eq(travelTypes.isActive, true))
        .orderBy(asc(travelTypes.sortOrder), asc(travelTypes.name)),
    ),
  );

  app.get('/destinations', { preHandler: [app.authorize('masterdata.read')] }, async () =>
    ok(
      await db
        .select({
          id: destinations.id,
          name: destinations.name,
          countryCode: destinations.countryCode,
          isDomestic: destinations.isDomestic,
        })
        .from(destinations)
        .where(eq(destinations.isActive, true))
        .orderBy(asc(destinations.name)),
    ),
  );

  app.get('/visa-countries', { preHandler: [app.authorize('masterdata.read')] }, async () =>
    ok(
      await db
        .select({
          id: visaCountries.id,
          countryCode: visaCountries.countryCode,
          name: visaCountries.name,
          processingDaysMin: visaCountries.processingDaysMin,
          processingDaysMax: visaCountries.processingDaysMax,
        })
        .from(visaCountries)
        .where(eq(visaCountries.isActive, true))
        .orderBy(asc(visaCountries.name)),
    ),
  );

  app.get('/payment-methods', { preHandler: [app.authorize('masterdata.read')] }, async () =>
    ok(
      await db
        .select({ id: paymentMethods.id, key: paymentMethods.key, name: paymentMethods.name })
        .from(paymentMethods)
        .where(eq(paymentMethods.isActive, true))
        .orderBy(asc(paymentMethods.sortOrder)),
    ),
  );

  app.get('/supplier-types', { preHandler: [app.authorize('masterdata.read')] }, async () =>
    ok(
      await db
        .select({ id: supplierTypes.id, key: supplierTypes.key, name: supplierTypes.name })
        .from(supplierTypes)
        .where(eq(supplierTypes.isActive, true))
        .orderBy(asc(supplierTypes.name)),
    ),
  );
}
