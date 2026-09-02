import { changePasswordSchema, loginSchema } from '@lemuria/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { isProd } from '../../config/env.js';
import { auditContext } from '../../lib/audit.js';
import { unauthenticated } from '../../lib/errors.js';
import { ok } from '../../lib/reply.js';
import { requireUser } from '../../plugins/auth.js';
import * as authService from './auth.service.js';

const REFRESH_COOKIE = 'lemuria_rt';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  /**
   * The refresh token is set as an httpOnly cookie and never returned in the
   * body, so a XSS payload on the SPA cannot read it out of JavaScript.
   */
  const setRefreshCookie = (reply: FastifyReply, token: string): void => {
    reply.setCookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      path: '/api/v1/auth',
      maxAge: Math.floor(authService.REFRESH_TTL_MS / 1000),
    });
  };

  app.post(
    '/login',
    {
      // Brute-force protection independent of the global limit.
      config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
    },
    async (req, reply) => {
      const input = loginSchema.parse(req.body);
      const result = await authService.login(app, input, auditContext(req));
      setRefreshCookie(reply, result.refreshToken);
      return ok({
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
        user: result.user,
      });
    },
  );

  app.post(
    '/refresh',
    { config: { rateLimit: { max: 60, timeWindow: '5 minutes' } } },
    async (req, reply) => {
      const presented = req.cookies[REFRESH_COOKIE];
      if (!presented) throw unauthenticated('Your session has expired. Sign in again.');

      const result = await authService.refresh(app, presented, auditContext(req));
      setRefreshCookie(reply, result.refreshToken);
      return ok({
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
        user: result.user,
      });
    },
  );

  app.post('/logout', async (req, reply) => {
    await authService.logout(req.cookies[REFRESH_COOKIE], auditContext(req));
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return ok({ signedOut: true });
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (req) => ok(requireUser(req)));

  app.post('/change-password', { preHandler: [app.authenticate] }, async (req) => {
    const user = requireUser(req);
    const input = changePasswordSchema.parse(req.body);
    await authService.changePassword(
      user.id,
      input.currentPassword,
      input.newPassword,
      auditContext(req),
    );
    return ok({ changed: true });
  });
}
