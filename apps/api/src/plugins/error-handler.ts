import type { ApiErrorBody, ErrorCode } from '@lemuria/shared';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { isProd } from '../config/env.js';
import { isAppError } from '../lib/errors.js';

/** Postgres SQLSTATE codes we translate into business-readable failures. */
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_CHECK_VIOLATION = '23514';

interface PgError {
  code?: string;
  constraint_name?: string;
  detail?: string;
}

function zodDetails(err: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export default fp(
  async (app: FastifyInstance) => {
    app.setNotFoundHandler((req, reply) => {
      const body: ApiErrorBody = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `No route for ${req.method} ${req.url}`,
          requestId: req.id,
        },
      };
      reply.status(404).send(body);
    });

    app.setErrorHandler((err, req, reply) => {
      let code: ErrorCode = 'INTERNAL_ERROR';
      let status = 500;
      let message = 'Something went wrong. Please try again.';
      let details: unknown;
      let unexpected = true;

      if (isAppError(err)) {
        ({ code, statusCode: status, message } = err);
        details = err.details;
        unexpected = !err.expected;
      } else if (err instanceof ZodError) {
        code = 'VALIDATION_ERROR';
        status = 400;
        message = 'Some fields need attention.';
        details = zodDetails(err);
        unexpected = false;
      } else if ((err as { statusCode?: number }).statusCode === 429) {
        code = 'RATE_LIMITED';
        status = 429;
        message = 'Too many requests. Please slow down.';
        unexpected = false;
      } else if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
        code = 'PAYLOAD_TOO_LARGE';
        status = 413;
        message = 'That file is too large.';
        unexpected = false;
      } else {
        const pg = err as unknown as PgError;
        if (pg.code === PG_UNIQUE_VIOLATION) {
          code = 'CONFLICT';
          status = 409;
          message = 'That record already exists.';
          details = isProd ? undefined : { constraint: pg.constraint_name };
          unexpected = false;
        } else if (pg.code === PG_FOREIGN_KEY_VIOLATION) {
          code = 'VALIDATION_ERROR';
          status = 400;
          message = 'A referenced record does not exist.';
          unexpected = false;
        } else if (pg.code === PG_CHECK_VIOLATION) {
          code = 'VALIDATION_ERROR';
          status = 400;
          message = 'That value is not allowed.';
          unexpected = false;
        }
      }

      // Unexpected faults get a full stack in the log; the client never sees it.
      if (unexpected) {
        req.log.error({ err, route: req.routeOptions?.url }, 'unhandled error');
      } else {
        req.log.info({ code, route: req.routeOptions?.url, msg: err.message }, 'request rejected');
      }

      const body: ApiErrorBody = {
        success: false,
        error: {
          code,
          message,
          ...(details !== undefined ? { details } : {}),
          requestId: req.id,
        },
      };
      reply.status(status).send(body);
    });
  },
  { name: 'error-handler' },
);
