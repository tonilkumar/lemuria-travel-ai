import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
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
import {
  followupStatusEnum,
  followupTypeEnum,
  leadClassificationEnum,
  leadStatusEnum,
  money,
  primaryId,
  priorityEnum,
  timestamps,
} from './_shared.js';
import { users } from './auth.js';
import { customers } from './customers.js';
import { leadSources, travelTypes } from './masterdata.js';

/**
 * An enquiry in progress. A lead may exist before a customer record does; on
 * conversion it links to the customer without losing its own history (spec §10).
 */
export const leads = pgTable(
  'leads',
  {
    id: primaryId(),
    /** Human-facing identifier, e.g. LM-L-2026-001234. */
    leadCode: varchar('lead_code', { length: 32 }).notNull(),

    /** Set on conversion, or immediately if raised against a known customer. */
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),

    // Enquirer details captured at Quick Enquiry time.
    customerName: varchar('customer_name', { length: 160 }).notNull(),
    nameNormalised: varchar('name_normalised', { length: 160 }).notNull(),
    phone: varchar('phone', { length: 20 }).notNull(),
    email: varchar('email', { length: 254 }),

    // Requirement.
    destination: varchar('destination', { length: 160 }),
    travelDate: date('travel_date'),
    travelDateFlexible: boolean('travel_date_flexible').notNull().default(false),
    travellersAdults: integer('travellers_adults').notNull().default(1),
    travellersChildren: integer('travellers_children').notNull().default(0),
    travelTypeId: uuid('travel_type_id').references(() => travelTypes.id, { onDelete: 'set null' }),
    budgetAmount: money('budget_amount'),
    budgetCurrency: varchar('budget_currency', { length: 3 }).notNull().default('INR'),

    leadSourceId: uuid('lead_source_id')
      .notNull()
      .references(() => leadSources.id, { onDelete: 'restrict' }),
    status: leadStatusEnum('status').notNull().default('OPEN'),
    lostReason: text('lost_reason'),

    // Scoring - written by the AI scoring service, always overridable by a human.
    score: integer('score').notNull().default(0),
    classification: leadClassificationEnum('classification').notNull().default('COLD'),
    scoreReason: text('score_reason'),
    scoredAt: timestamp('scored_at', { withTimezone: true }),
    scoreIsManual: boolean('score_is_manual').notNull().default(false),

    assignedToId: uuid('assigned_to_id').references(() => users.id, { onDelete: 'set null' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),

    // Denormalised for list performance - kept current by the service layer so the
    // lead table can sort and filter on them without correlated subqueries (spec §38).
    nextFollowupAt: timestamp('next_followup_at', { withTimezone: true }),
    lastContactAt: timestamp('last_contact_at', { withTimezone: true }),
    lastContactChannel: varchar('last_contact_channel', { length: 20 }),

    convertedAt: timestamp('converted_at', { withTimezone: true }),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('leads_code_idx').on(t.leadCode),
    index('leads_phone_idx').on(t.phone),
    index('leads_email_idx').on(t.email),
    index('leads_name_normalised_idx').on(t.nameNormalised),
    index('leads_customer_idx').on(t.customerId),
    // Composite indexes matching the Leads workspace default sorts and tabs.
    index('leads_status_created_idx').on(t.status, t.createdAt),
    index('leads_assigned_status_idx').on(t.assignedToId, t.status),
    index('leads_classification_idx').on(t.classification),
    index('leads_source_idx').on(t.leadSourceId),
    index('leads_next_followup_idx').on(t.nextFollowupAt),
    index('leads_created_at_idx').on(t.createdAt),
  ],
);

/** Every assignment change, so ownership at any past date stays answerable. */
export const leadAssignments = pgTable(
  'lead_assignments',
  {
    id: primaryId(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    fromUserId: uuid('from_user_id').references(() => users.id, { onDelete: 'set null' }),
    toUserId: uuid('to_user_id').references(() => users.id, { onDelete: 'set null' }),
    assignedById: uuid('assigned_by_id').references(() => users.id, { onDelete: 'set null' }),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('lead_assignments_lead_idx').on(t.leadId, t.createdAt)],
);

/** Score history, retained so a past classification stays explainable. */
export const leadScores = pgTable(
  'lead_scores',
  {
    id: primaryId(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(),
    classification: leadClassificationEnum('classification').notNull(),
    reason: text('reason'),
    /** Signal breakdown the score came from, for internal explainability. */
    factors: jsonb('factors').$type<Record<string, number>>(),
    isManual: boolean('is_manual').notNull().default(false),
    aiProvider: varchar('ai_provider', { length: 40 }),
    aiModel: varchar('ai_model', { length: 80 }),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('lead_scores_lead_idx').on(t.leadId, t.createdAt)],
);

export const leadStatusHistory = pgTable(
  'lead_status_history',
  {
    id: primaryId(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    fromStatus: leadStatusEnum('from_status'),
    toStatus: leadStatusEnum('to_status').notNull(),
    reason: text('reason'),
    changedById: uuid('changed_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('lead_status_history_lead_idx').on(t.leadId, t.createdAt)],
);

/**
 * Follow-ups drive the daily work queue. OVERDUE is written by the scheduler
 * rather than inferred at read time, so lists and dashboards always agree.
 */
export const followups = pgTable(
  'followups',
  {
    id: primaryId(),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
    assignedToId: uuid('assigned_to_id').references(() => users.id, { onDelete: 'set null' }),

    type: followupTypeEnum('type').notNull(),
    status: followupStatusEnum('status').notNull().default('PENDING'),
    priority: priorityEnum('priority').notNull().default('MEDIUM'),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    description: text('description').notNull(),

    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedById: uuid('completed_by_id').references(() => users.id, { onDelete: 'set null' }),
    outcome: text('outcome'),

    /** Chains a rescheduled follow-up back to the one it replaced. */
    previousFollowupId: uuid('previous_followup_id'),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('followups_lead_idx').on(t.leadId),
    index('followups_customer_idx').on(t.customerId),
    // Backs the overdue / today / upcoming buckets on the dashboard.
    index('followups_assigned_status_due_idx').on(t.assignedToId, t.status, t.dueAt),
    index('followups_status_due_idx').on(t.status, t.dueAt),
  ],
);

/** Free-form notes on a lead or customer, shown on the unified timeline. */
export const notes = pgTable(
  'notes',
  {
    id: primaryId(),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    isPinned: boolean('is_pinned').notNull().default(false),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('notes_lead_idx').on(t.leadId, t.createdAt),
    index('notes_customer_idx').on(t.customerId, t.createdAt),
  ],
);

export const leadsRelations = relations(leads, ({ one, many }) => ({
  customer: one(customers, { fields: [leads.customerId], references: [customers.id] }),
  assignedTo: one(users, { fields: [leads.assignedToId], references: [users.id] }),
  source: one(leadSources, { fields: [leads.leadSourceId], references: [leadSources.id] }),
  travelType: one(travelTypes, { fields: [leads.travelTypeId], references: [travelTypes.id] }),
  followups: many(followups),
  notes: many(notes),
  statusHistory: many(leadStatusHistory),
  scores: many(leadScores),
  assignments: many(leadAssignments),
}));

export const followupsRelations = relations(followups, ({ one }) => ({
  lead: one(leads, { fields: [followups.leadId], references: [leads.id] }),
  customer: one(customers, { fields: [followups.customerId], references: [customers.id] }),
  assignedTo: one(users, { fields: [followups.assignedToId], references: [users.id] }),
}));
