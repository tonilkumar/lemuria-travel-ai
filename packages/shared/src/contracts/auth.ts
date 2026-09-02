import { z } from 'zod';
import { ROLES } from '../domain/enums.js';
import type { Permission } from '../domain/permissions.js';
import { emailSchema } from './api.js';

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(200),
  mfaCode: z.string().regex(/^\d{6}$/).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Password policy. Enforced server-side; the frontend mirrors it only to give
 * feedback while typing.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(200)
  .refine((v) => /[a-z]/.test(v), 'Add a lowercase letter')
  .refine((v) => /[A-Z]/.test(v), 'Add an uppercase letter')
  .refine((v) => /\d/.test(v), 'Add a number')
  .refine((v) => /[^A-Za-z0-9]/.test(v), 'Add a symbol');

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const createUserSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: emailSchema,
  phone: z.string().trim().max(20).optional(),
  password: passwordSchema,
  roles: z.array(z.enum(ROLES)).min(1, 'Assign at least one role'),
  designation: z.string().trim().max(120).optional(),
  isActive: z.boolean().default(true),
});

export const updateUserSchema = createUserSchema.partial().omit({ password: true });

/** Shape returned by GET /api/v1/auth/me and embedded in the access token. */
export interface AuthenticatedUser {
  id: string;
  fullName: string;
  email: string;
  designation: string | null;
  avatarUrl: string | null;
  roles: string[];
  permissions: Permission[];
  mustChangePassword: boolean;
}

export interface LoginResponse {
  accessToken: string;
  /** Refresh token is delivered as an httpOnly cookie; never in the body. */
  expiresIn: number;
  user: AuthenticatedUser;
}
