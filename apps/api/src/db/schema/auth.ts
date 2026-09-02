import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  inet,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared.js';

export const users = pgTable(
  'users',
  {
    id: primaryId(),
    employeeCode: varchar('employee_code', { length: 32 }).unique(),
    fullName: varchar('full_name', { length: 160 }).notNull(),
    email: varchar('email', { length: 254 }).notNull(),
    phone: varchar('phone', { length: 20 }),
    designation: varchar('designation', { length: 120 }),
    avatarUrl: text('avatar_url'),

    passwordHash: text('password_hash').notNull(),
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),

    /** MFA is schema-ready in Phase 1; enforcement is behind MFA_ENABLED. */
    mfaSecret: text('mfa_secret'),
    mfaEnabledAt: timestamp('mfa_enabled_at', { withTimezone: true }),

    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    failedLoginAttempts: varchar('failed_login_attempts', { length: 8 }).notNull().default('0'),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('users_email_unique_idx').on(t.email).where(sql`${t.deletedAt} is null`),
    index('users_active_idx').on(t.isActive),
  ],
);

export const roles = pgTable('roles', {
  id: primaryId(),
  key: varchar('key', { length: 32 }).notNull().unique(),
  name: varchar('name', { length: 80 }).notNull(),
  description: text('description'),
  isSystem: boolean('is_system').notNull().default(true),
  ...timestamps,
});

export const permissions = pgTable('permissions', {
  id: primaryId(),
  key: varchar('key', { length: 64 }).notNull().unique(),
  resource: varchar('resource', { length: 32 }).notNull(),
  action: varchar('action', { length: 32 }).notNull(),
  description: text('description'),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    assignedById: uuid('assigned_by_id').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

/**
 * Refresh tokens are stored hashed so a database leak cannot mint sessions.
 * Rotation: each refresh issues a new row and marks the old one replaced.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: primaryId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacedByTokenId: uuid('replaced_by_token_id'),
    userAgent: text('user_agent'),
    ipAddress: inet('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('refresh_tokens_hash_idx').on(t.tokenHash),
    index('refresh_tokens_user_idx').on(t.userId, t.expiresAt),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  userRoles: many(userRoles),
  refreshTokens: many(refreshTokens),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  rolePermissions: many(rolePermissions),
  userRoles: many(userRoles),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, { fields: [rolePermissions.permissionId], references: [permissions.id] }),
}));
