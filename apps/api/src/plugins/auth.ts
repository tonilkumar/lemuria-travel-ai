import type { AuthenticatedUser, Permission } from '@lemuria/shared';
import { permissionsForRoles, type Role } from '@lemuria/shared';
import { eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { roles as rolesTable, userRoles, users } from '../db/schema/auth.js';
import { forbidden, unauthenticated } from '../lib/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Populated by `authenticate`; absent on public routes. */
    currentUser?: AuthenticatedUser;
  }
  interface FastifyInstance {
    /** Rejects the request unless a valid access token is present. */
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /**
     * Rejects unless the caller holds every listed permission. Always pair with
     * `authenticate` — authorisation without authentication is a bug.
     */
    authorize: (
      ...required: Permission[]
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: Role[];
}

/**
 * Loads the user fresh from the database on every authenticated request.
 *
 * Permissions deliberately are NOT trusted from the token: revoking a role must
 * take effect immediately, not when the 15-minute access token expires.
 */
async function loadUser(userId: string): Promise<AuthenticatedUser | null> {
  const rows = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      designation: users.designation,
      avatarUrl: users.avatarUrl,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
      deletedAt: users.deletedAt,
      roleKey: rolesTable.key,
    })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(rolesTable, eq(rolesTable.id, userRoles.roleId))
    .where(eq(users.id, userId));

  const first = rows[0];
  if (!first || !first.isActive || first.deletedAt) return null;

  const roleKeys = rows
    .map((r) => r.roleKey)
    .filter((k): k is string => Boolean(k)) as Role[];

  return {
    id: first.id,
    fullName: first.fullName,
    email: first.email,
    designation: first.designation,
    avatarUrl: first.avatarUrl,
    roles: roleKeys,
    permissions: [...permissionsForRoles(roleKeys)],
    mustChangePassword: first.mustChangePassword,
  };
}

export default fp(
  async (app) => {
    await app.register(import('@fastify/jwt'), {
      secret: env.JWT_ACCESS_SECRET,
      sign: { expiresIn: env.JWT_ACCESS_TTL },
      // Refresh tokens are opaque and stored hashed; they are not JWTs.
      cookie: { cookieName: 'lemuria_at', signed: false },
    });

    app.decorate('authenticate', async (req: FastifyRequest, _reply: FastifyReply) => {
      let payload: AccessTokenPayload;
      try {
        payload = await req.jwtVerify<AccessTokenPayload>();
      } catch {
        throw unauthenticated('Your session has expired. Sign in again.');
      }

      const user = await loadUser(payload.sub);
      if (!user) throw unauthenticated('This account is no longer active.');
      req.currentUser = user;
    });

    app.decorate(
      'authorize',
      (...required: Permission[]) =>
        async (req: FastifyRequest, _reply: FastifyReply) => {
          const user = req.currentUser;
          if (!user) throw unauthenticated();

          const held = new Set(user.permissions);
          const missing = required.filter((p) => !held.has(p));
          if (missing.length > 0) {
            req.log.warn(
              { userId: user.id, required, missing, route: req.routeOptions.url },
              'authorisation denied',
            );
            throw forbidden('You do not have permission to perform this action.');
          }
        },
    );
  },
  { name: 'auth' },
);

/** Convenience for services that need the caller and know one must exist. */
export function requireUser(req: FastifyRequest): AuthenticatedUser {
  if (!req.currentUser) throw unauthenticated();
  return req.currentUser;
}
