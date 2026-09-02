import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { corsOrigins, env, isProd } from './config/env.js';
import { logger } from './lib/logger.js';
import authPlugin from './plugins/auth.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import { registerRoutes } from './routes.js';

export async function buildServer() {
  const app = Fastify({
    loggerInstance: logger,
    genReqId: () => randomUUID(),
    trustProxy: isProd,
    bodyLimit: 2 * 1024 * 1024,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });

  await app.register(import('@fastify/helmet'), {
    contentSecurityPolicy: false, // The API serves JSON only; the SPA sets its own CSP.
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

  await app.register(import('@fastify/cors'), {
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await app.register(import('@fastify/cookie'), {
    secret: env.JWT_REFRESH_SECRET,
    parseOptions: { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/' },
  });

  await app.register(import('@fastify/rate-limit'), {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    // Rate limit per authenticated user where possible, else per IP.
    keyGenerator: (req) => req.currentUser?.id ?? req.ip,
  });

  await app.register(import('@fastify/multipart'), {
    limits: { fileSize: 25 * 1024 * 1024, files: 10 },
  });

  await app.register(errorHandlerPlugin);
  await app.register(authPlugin);

  app.get('/health', { config: { rateLimit: false } }, async () => ({
    status: 'ok',
    service: 'lemuria-api',
    version: process.env.npm_package_version ?? '0.1.0',
  }));

  await app.register(registerRoutes, { prefix: '/api/v1' });

  return app;
}
