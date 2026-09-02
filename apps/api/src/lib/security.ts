import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { env } from '../config/env.js';

/**
 * Argon2id parameters. 19 MiB / t=2 / p=1 is the OWASP baseline; raising memory
 * costs more than raising iterations for the same defensive value.
 */
const ARGON_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * The pepper is appended before hashing. It lives in the environment, not the
 * database, so a stolen dump alone cannot be cracked offline.
 */
const pepper = (plain: string): string => `${plain}${env.PASSWORD_PEPPER}`;

export async function hashPassword(plain: string): Promise<string> {
  return argonHash(pepper(plain), ARGON_OPTIONS);
}

export async function verifyPassword(plain: string, storedHash: string): Promise<boolean> {
  try {
    return await argonVerify(storedHash, pepper(plain));
  } catch {
    // A malformed hash must read as "wrong password", never as a server error.
    return false;
  }
}

/**
 * Constant-time comparison of a candidate against a stored hash. Used for
 * webhook signatures and refresh tokens where the value is already digest-sized.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Opaque refresh token. Returned to the client once; only its hash is stored. */
export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(48).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Deterministic hash for duplicate detection on identifiers we refuse to store
 * in the clear (passport numbers). Salted with the pepper so the digests are
 * useless outside this deployment.
 */
export function fingerprint(value: string): string {
  return createHash('sha256')
    .update(value.trim().toUpperCase())
    .update(env.PASSWORD_PEPPER)
    .digest('hex');
}
