import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  communicationChannelEnum,
  communicationDirectionEnum,
  primaryId,
  timestamps,
} from './_shared.js';
import { users } from './auth.js';
import { customers } from './customers.js';
import { leads } from './leads.js';

/**
 * One row per conversation thread with a customer on a channel. Inbound
 * WhatsApp is matched to an existing customer or lead by phone number before a
 * new thread is opened, so a customer never fragments across channels (spec §2).
 */
export const communicationThreads = pgTable(
  'communication_threads',
  {
    id: primaryId(),
    channel: communicationChannelEnum('channel').notNull(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    /** Phone in E.164 or email address, depending on channel. */
    externalAddress: varchar('external_address', { length: 254 }).notNull(),
    subject: varchar('subject', { length: 300 }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    unreadCount: varchar('unread_count', { length: 8 }).notNull().default('0'),
    assignedToId: uuid('assigned_to_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('communication_threads_customer_idx').on(t.customerId, t.lastMessageAt),
    index('communication_threads_lead_idx').on(t.leadId),
    index('communication_threads_address_idx').on(t.channel, t.externalAddress),
  ],
);

export const communicationMessages = pgTable(
  'communication_messages',
  {
    id: primaryId(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => communicationThreads.id, { onDelete: 'cascade' }),
    channel: communicationChannelEnum('channel').notNull(),
    direction: communicationDirectionEnum('direction').notNull(),

    /** Provider message id, used for delivery receipts and idempotent webhooks. */
    externalId: varchar('external_id', { length: 128 }),
    body: text('body'),
    /** [{ documentId, fileName, mimeType }] */
    attachments: jsonb('attachments').$type<Record<string, unknown>[]>().default([]),

    templateId: uuid('template_id'),
    /** QUEUED | SENT | DELIVERED | READ | FAILED */
    status: varchar('status', { length: 20 }).notNull().default('QUEUED'),
    failureReason: text('failure_reason'),

    sentById: uuid('sent_by_id').references(() => users.id, { onDelete: 'set null' }),
    aiGenerationId: uuid('ai_generation_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('communication_messages_thread_idx').on(t.threadId, t.createdAt),
    uniqueIndex('communication_messages_external_idx').on(t.channel, t.externalId),
    index('communication_messages_status_idx').on(t.status),
  ],
);

/** Reusable message bodies, including WhatsApp templates registered with Meta. */
export const communicationTemplates = pgTable(
  'communication_templates',
  {
    id: primaryId(),
    key: varchar('key', { length: 60 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    channel: communicationChannelEnum('channel').notNull(),
    category: varchar('category', { length: 40 }),
    subject: varchar('subject', { length: 300 }),
    body: text('body').notNull(),
    variables: jsonb('variables').$type<string[]>().default([]),
    /** Meta-approved template name, required for outbound WhatsApp outside the 24h window. */
    providerTemplateName: varchar('provider_template_name', { length: 120 }),
    providerApprovalStatus: varchar('provider_approval_status', { length: 30 }),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('communication_templates_key_idx').on(t.key, t.channel)],
);
