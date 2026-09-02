import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { customerTierEnum, primaryId, timestamps } from './_shared.js';
import { users } from './auth.js';

/**
 * A person Lemuria does business with. One human = one customer row, regardless
 * of whether they arrived by WhatsApp, website, walk-in or referral (spec §2).
 * Duplicate detection guards this invariant at creation time.
 */
export const customers = pgTable(
  'customers',
  {
    id: primaryId(),
    /** Human-facing identifier, e.g. LM-C-2026-00042. Generated, never reused. */
    customerCode: varchar('customer_code', { length: 32 }).notNull(),

    fullName: varchar('full_name', { length: 160 }).notNull(),
    /** Lowercased, whitespace-stripped name used only for duplicate matching. */
    nameNormalised: varchar('name_normalised', { length: 160 }).notNull(),
    salutation: varchar('salutation', { length: 12 }),
    dateOfBirth: date('date_of_birth'),
    gender: varchar('gender', { length: 20 }),
    nationality: varchar('nationality', { length: 60 }).default('Indian'),

    primaryPhone: varchar('primary_phone', { length: 20 }).notNull(),
    alternatePhone: varchar('alternate_phone', { length: 20 }),
    email: varchar('email', { length: 254 }),

    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: varchar('city', { length: 80 }),
    state: varchar('state', { length: 80 }),
    postalCode: varchar('postal_code', { length: 16 }),
    country: varchar('country', { length: 80 }).default('India'),

    tier: customerTierEnum('tier').notNull().default('BRONZE'),
    /** 0-100 relationship score, recomputed from booking history and recency. */
    relationshipScore: integer('relationship_score').notNull().default(0),

    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    /** Head of the family/group this customer travels with. */
    groupId: uuid('group_id'),

    isActive: boolean('is_active').notNull().default(true),
    firstBookingAt: date('first_booking_at'),
    lastBookingAt: date('last_booking_at'),
    lastActivityAt: date('last_activity_at'),
    totalBookings: integer('total_bookings').notNull().default(0),

    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('customers_code_idx').on(t.customerCode),
    // Duplicate detection reads these constantly (spec §12).
    index('customers_phone_idx').on(t.primaryPhone),
    index('customers_email_idx').on(t.email),
    index('customers_name_normalised_idx').on(t.nameNormalised),
    index('customers_owner_idx').on(t.ownerId),
    index('customers_tier_idx').on(t.tier),
  ],
);

/** Family / travel group. Members share documents and often travel together. */
export const customerGroups = pgTable(
  'customer_groups',
  {
    id: primaryId(),
    name: varchar('name', { length: 160 }).notNull(),
    primaryCustomerId: uuid('primary_customer_id').references(() => customers.id, { onDelete: 'set null' }),
    ...timestamps,
  },
);

export const customerGroupMembers = pgTable(
  'customer_group_members',
  {
    id: primaryId(),
    groupId: uuid('group_id').notNull().references(() => customerGroups.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
    /** spouse, child, parent, colleague… free text, not enforced. */
    relationship: varchar('relationship', { length: 60 }),
    ...timestamps,
  },
  (t) => [uniqueIndex('customer_group_members_unique_idx').on(t.groupId, t.customerId)],
);

export const customerPreferences = pgTable(
  'customer_preferences',
  {
    id: primaryId(),
    customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
    mealPreference: varchar('meal_preference', { length: 40 }),
    seatPreference: varchar('seat_preference', { length: 40 }),
    hotelCategory: varchar('hotel_category', { length: 40 }),
    roomPreference: varchar('room_preference', { length: 40 }),
    interests: jsonb('interests').$type<string[]>().default([]),
    dietaryRestrictions: text('dietary_restrictions'),
    accessibilityNeeds: text('accessibility_needs'),
    preferredLanguage: varchar('preferred_language', { length: 40 }),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [uniqueIndex('customer_preferences_customer_idx').on(t.customerId)],
);

export const customersRelations = relations(customers, ({ one, many }) => ({
  owner: one(users, { fields: [customers.ownerId], references: [users.id] }),
  preferences: one(customerPreferences),
  groupMemberships: many(customerGroupMembers),
}));
