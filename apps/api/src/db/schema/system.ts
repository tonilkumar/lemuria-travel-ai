import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { aiReviewStatusEnum, primaryId, timestamps } from './_shared.js';
import { users } from './auth.js';

/**
 * Append-only activity log (spec §29). The application never issues UPDATE or
 * DELETE against this table; a database grant enforces that in production, so
 * an application-level bug cannot quietly rewrite history.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: primaryId(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    /** Preserved even if the user row is later removed. */
    actorEmail: varchar('actor_email', { length: 254 }),

    action: varchar('action', { length: 60 }).notNull(),
    entityType: varchar('entity_type', { length: 40 }).notNull(),
    entityId: uuid('entity_id'),
    entityCode: varchar('entity_code', { length: 40 }),

    /** Changed fields only, already redacted of secrets and full ID numbers. */
    changedFields: jsonb('changed_fields').$type<string[]>(),
    oldValues: jsonb('old_values').$type<Record<string, unknown>>(),
    newValues: jsonb('new_values').$type<Record<string, unknown>>(),

    summary: text('summary'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    requestId: varchar('request_id', { length: 40 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_entity_idx').on(t.entityType, t.entityId, t.createdAt),
    index('audit_logs_actor_idx').on(t.actorId, t.createdAt),
    index('audit_logs_action_idx').on(t.action, t.createdAt),
    index('audit_logs_created_idx').on(t.createdAt),
  ],
);

/**
 * Central notification store. Modules emit domain events; the notification
 * service decides channels and templates, so no module owns its own delivery.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: primaryId(),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 60 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body'),
    entityType: varchar('entity_type', { length: 40 }),
    entityId: uuid('entity_id'),
    /** Relative app path the notification deep-links to. */
    linkPath: text('link_path'),
    readAt: timestamp('read_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('notifications_recipient_idx').on(t.recipientId, t.readAt, t.createdAt),
    index('notifications_event_idx').on(t.eventType),
  ],
);

/** Per-channel delivery attempts for a notification, with retry bookkeeping. */
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: primaryId(),
    notificationId: uuid('notification_id')
      .notNull()
      .references(() => notifications.id, { onDelete: 'cascade' }),
    channel: varchar('channel', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('notification_deliveries_notification_idx').on(t.notificationId)],
);

export const notificationTemplates = pgTable(
  'notification_templates',
  {
    id: primaryId(),
    eventType: varchar('event_type', { length: 60 }).notNull(),
    channel: varchar('channel', { length: 20 }).notNull(),
    subject: varchar('subject', { length: 200 }),
    body: text('body').notNull(),
    /** Placeholder names the template accepts, used to validate before send. */
    variables: jsonb('variables').$type<string[]>().default([]),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [index('notification_templates_event_channel_idx').on(t.eventType, t.channel)],
);

/**
 * Every AI generation is recorded with its review state (spec §24, §46).
 * Customer-facing output cannot be sent while status is GENERATED or EDITED —
 * the send path checks for APPROVED and refuses otherwise.
 */
export const aiGenerations = pgTable(
  'ai_generations',
  {
    id: primaryId(),
    kind: varchar('kind', { length: 40 }).notNull(),
    entityType: varchar('entity_type', { length: 40 }),
    entityId: uuid('entity_id'),

    provider: varchar('provider', { length: 40 }).notNull(),
    model: varchar('model', { length: 80 }).notNull(),

    /** Redacted prompt retained for debugging; raw PII is never stored here. */
    promptSummary: text('prompt_summary'),
    outputText: text('output_text'),
    /** Human-edited version, when the reviewer changed the draft before approving. */
    editedText: text('edited_text'),

    status: aiReviewStatusEnum('status').notNull().default('GENERATED'),
    reviewedById: uuid('reviewed_by_id').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),

    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    latencyMs: integer('latency_ms'),
    /** True when the context builder had to include personally identifying fields. */
    containedPii: boolean('contained_pii').notNull().default(false),

    requestedById: uuid('requested_by_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('ai_generations_entity_idx').on(t.entityType, t.entityId),
    index('ai_generations_status_idx').on(t.status),
    index('ai_generations_kind_idx').on(t.kind, t.createdAt),
  ],
);

/** Sequence counters backing human-readable codes such as LM-L-2026-001234. */
export const codeSequences = pgTable(
  'code_sequences',
  {
    id: primaryId(),
    scope: varchar('scope', { length: 40 }).notNull(),
    year: integer('year').notNull(),
    lastValue: integer('last_value').notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex('code_sequences_scope_year_idx').on(t.scope, t.year)],
);
