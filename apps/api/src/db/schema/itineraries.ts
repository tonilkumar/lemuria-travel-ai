import {
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
import { primaryId, timestamps } from './_shared.js';
import { users } from './auth.js';
import { customers } from './customers.js';
import { leads } from './leads.js';
import { quotations } from './quotations.js';

/**
 * Itineraries carry three parallel variants of the same trip (spec §18):
 * SALES (pre-booking pitch), CONFIRMED (what the customer bought) and
 * OPERATIONAL (internal, with supplier and driver detail). Each is a version
 * row, so publishing a sales version never mutates the operational one.
 */
export const itineraries = pgTable(
  'itineraries',
  {
    id: primaryId(),
    itineraryCode: varchar('itinerary_code', { length: 32 }).notNull(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    quotationId: uuid('quotation_id').references(() => quotations.id, { onDelete: 'set null' }),

    title: varchar('title', { length: 200 }).notNull(),
    destination: varchar('destination', { length: 160 }),
    startDate: date('start_date'),
    endDate: date('end_date'),
    durationDays: integer('duration_days'),
    travellersAdults: integer('travellers_adults').notNull().default(1),
    travellersChildren: integer('travellers_children').notNull().default(0),
    interests: jsonb('interests').$type<string[]>().default([]),

    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('itineraries_code_idx').on(t.itineraryCode),
    index('itineraries_customer_idx').on(t.customerId),
    index('itineraries_quotation_idx').on(t.quotationId),
  ],
);

export const itineraryVersions = pgTable(
  'itinerary_versions',
  {
    id: primaryId(),
    itineraryId: uuid('itinerary_id')
      .notNull()
      .references(() => itineraries.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    /** SALES | CONFIRMED | OPERATIONAL */
    variant: varchar('variant', { length: 20 }).notNull().default('SALES'),
    status: varchar('status', { length: 20 }).notNull().default('DRAFT'),

    coverTitle: varchar('cover_title', { length: 200 }),
    coverImageUrl: text('cover_image_url'),
    summaryText: text('summary_text'),
    inclusions: jsonb('inclusions').$type<string[]>().default([]),
    exclusions: jsonb('exclusions').$type<string[]>().default([]),
    travelTips: jsonb('travel_tips').$type<string[]>().default([]),

    aiGenerationId: uuid('ai_generation_id'),
    pdfDocumentId: uuid('pdf_document_id'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('itinerary_versions_unique_idx').on(t.itineraryId, t.variant, t.versionNumber),
    index('itinerary_versions_itinerary_idx').on(t.itineraryId),
  ],
);

export const itineraryDays = pgTable(
  'itinerary_days',
  {
    id: primaryId(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => itineraryVersions.id, { onDelete: 'cascade' }),
    dayNumber: integer('day_number').notNull(),
    date: date('date'),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    city: varchar('city', { length: 120 }),
    hotelName: varchar('hotel_name', { length: 200 }),
    mealPlan: varchar('meal_plan', { length: 40 }),
    /** [{ time, title, description, lat, lng, durationMinutes }] */
    activities: jsonb('activities').$type<Record<string, unknown>[]>().default([]),
    transport: jsonb('transport').$type<Record<string, unknown>[]>().default([]),
    imageUrls: jsonb('image_urls').$type<string[]>().default([]),
    ...timestamps,
  },
  (t) => [uniqueIndex('itinerary_days_unique_idx').on(t.versionId, t.dayNumber)],
);
