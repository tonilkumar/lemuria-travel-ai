import type { AuthenticatedUser, LoginInput } from '@lemuria/shared';
import { permissionsForRoles, type Role } from '@lemuria/shared';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { refreshTokens, roles as rolesTable, userRoles, users } from '../../db/schema/auth.js';
import { recordAudit, type AuditContext } from '../../lib/audit.js';
import { badRequest, unauthenticated } from '../../lib/errors.js';
import { generateRefreshToken, hashPassword, hashToken, verifyPassword } from '../../lib/security.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function ttlToMs(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 15 * 60 * 1000;
  const value = Number(match[1]);
  const unit = match[2];
  const factor = unit === 's' ? 1e3 : unit === 'm' ? 6e4 : unit === 'h' ? 3.6e6 : 8.64e7;
  return value * factor;
}

export const REFRESH_TTL_MS = ttlToMs(env.JWT_REFRESH_TTL);
export const ACCESS_TTL_MS = ttlToMs(env.JWT_ACCESS_TTL);

async function rolesFor(userId: string): Promise<Role[]> {
  const rows = await db
    .select({ key: rolesTable.key })
    .from(userRoles)
    .innerJoin(rolesTable, eq(rolesTable.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
  return rows.map((r) => r.key as Role);
}

export interface LoginResult {
  user: AuthenticatedUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Verifies credentials and issues a token pair.
 *
 * Failure responses are deliberately identical for "no such account", "wrong
 * password" and "inactive account" so the endpoint cannot be used to enumerate
 * which email addresses exist.
 */
export async function login(
  app: FastifyInstance,
  input: LoginInput,
  ctx: AuditContext,
): Promise<LoginResult> {
  const genericFailure = unauthenticated('That email or password is not correct.');

  const [account] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, input.email), isNull(users.deletedAt)))
    .limit(1);

  if (!account) {
    // Spend comparable time hashing so a missing account is not detectably faster.
    await hashPassword(input.password).catch(() => undefined);
    throw genericFailure;
  }

  if (account.lockedUntil && account.lockedUntil > new Date()) {
    throw unauthenticated(
      `Too many failed attempts. Try again after ${LOCKOUT_MINUTES} minutes.`,
    );
  }

  const passwordOk = await verifyPassword(input.password, account.passwordHash);

  if (!passwordOk) {
    const attempts = Number(account.failedLoginAttempts ?? '0') + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
    await db
      .update(users)
      .set({
        failedLoginAttempts: String(shouldLock ? 0 : attempts),
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
      })
      .where(eq(users.id, account.id));

    await recordAudit({
      ...ctx,
      actorId: account.id,
      actorEmail: account.email,
      action: shouldLock ? 'auth.locked' : 'auth.login_failed',
      entityType: 'user',
      entityId: account.id,
      summary: shouldLock ? 'Account locked after repeated failures' : 'Failed sign-in',
    });

    throw genericFailure;
  }

  if (!account.isActive) throw genericFailure;

  if (env.MFA_ENABLED && account.mfaEnabledAt && !input.mfaCode) {
    throw badRequest('Enter the 6-digit code from your authenticator app.');
  }

  const roleKeys = await rolesFor(account.id);

  const accessToken = app.jwt.sign({
    sub: account.id,
    email: account.email,
    roles: roleKeys,
  });

  const { token, tokenHash } = generateRefreshToken();
  await db.insert(refreshTokens).values({
    userId: account.id,
    tokenHash,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    userAgent: ctx.userAgent ?? null,
    ipAddress: ctx.ipAddress ?? null,
  });

  await db
    .update(users)
    .set({ lastLoginAt: new Date(), failedLoginAttempts: '0', lockedUntil: null })
    .where(eq(users.id, account.id));

  await recordAudit({
    ...ctx,
    actorId: account.id,
    actorEmail: account.email,
    action: 'auth.login',
    entityType: 'user',
    entityId: account.id,
    summary: 'Signed in',
  });

  return {
    accessToken,
    refreshToken: token,
    expiresIn: Math.floor(ACCESS_TTL_MS / 1000),
    user: {
      id: account.id,
      fullName: account.fullName,
      email: account.email,
      designation: account.designation,
      avatarUrl: account.avatarUrl,
      roles: roleKeys,
      permissions: [...permissionsForRoles(roleKeys)],
      mustChangePassword: account.mustChangePassword,
    },
  };
}

/**
 * Exchanges a refresh token for a new pair, rotating the old one.
 *
 * Rotation is single-use: presenting an already-rotated token revokes the whole
 * chain for that user, on the assumption the token was stolen and replayed.
 */
export async function refresh(
  app: FastifyInstance,
  presentedToken: string,
  ctx: AuditContext,
): Promise<LoginResult> {
  const tokenHash = hashToken(presentedToken);

  const [stored] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);

  if (!stored) throw unauthenticated('Your session has expired. Sign in again.');

  if (stored.revokedAt) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, stored.userId), isNull(refreshTokens.revokedAt)));

    await recordAudit({
      ...ctx,
      actorId: stored.userId,
      action: 'auth.refresh_reuse_detected',
      entityType: 'user',
      entityId: stored.userId,
      summary: 'Reused refresh token — all sessions revoked',
    });

    throw unauthenticated('Your session has expired. Sign in again.');
  }

  if (stored.expiresAt <= new Date()) {
    throw unauthenticated('Your session has expired. Sign in again.');
  }

  const [account] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, stored.userId), isNull(users.deletedAt)))
    .limit(1);

  if (!account || !account.isActive) throw unauthenticated('This account is no longer active.');

  const roleKeys = await rolesFor(account.id);
  const accessToken = app.jwt.sign({ sub: account.id, email: account.email, roles: roleKeys });

  const rotated = generateRefreshToken();
  const [inserted] = await db
    .insert(refreshTokens)
    .values({
      userId: account.id,
      tokenHash: rotated.tokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      userAgent: ctx.userAgent ?? null,
      ipAddress: ctx.ipAddress ?? null,
    })
    .returning({ id: refreshTokens.id });

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date(), replacedByTokenId: inserted?.id ?? null })
    .where(eq(refreshTokens.id, stored.id));

  return {
    accessToken,
    refreshToken: rotated.token,
    expiresIn: Math.floor(ACCESS_TTL_MS / 1000),
    user: {
      id: account.id,
      fullName: account.fullName,
      email: account.email,
      designation: account.designation,
      avatarUrl: account.avatarUrl,
      roles: roleKeys,
      permissions: [...permissionsForRoles(roleKeys)],
      mustChangePassword: account.mustChangePassword,
    },
  };
}

export async function logout(presentedToken: string | undefined, ctx: AuditContext): Promise<void> {
  if (!presentedToken) return;
  const tokenHash = hashToken(presentedToken);
  const [revoked] = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
    .returning({ userId: refreshTokens.userId });

  if (revoked) {
    await recordAudit({
      ...ctx,
      actorId: revoked.userId,
      action: 'auth.logout',
      entityType: 'user',
      entityId: revoked.userId,
      summary: 'Signed out',
    });
  }
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  ctx: AuditContext,
): Promise<void> {
  const [account] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!account) throw unauthenticated();

  const ok = await verifyPassword(currentPassword, account.passwordHash);
  if (!ok) throw badRequest('Your current password is not correct.');

  const same = await verifyPassword(newPassword, account.passwordHash);
  if (same) throw badRequest('Choose a password you have not used here before.');

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(newPassword),
      passwordChangedAt: new Date(),
      mustChangePassword: false,
    })
    .where(eq(users.id, userId));

  // Changing a password ends every other session.
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.userId, userId),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, new Date()),
      ),
    );

  await recordAudit({
    ...ctx,
    action: 'auth.password_changed',
    entityType: 'user',
    entityId: userId,
    summary: 'Password changed; other sessions revoked',
  });
}
