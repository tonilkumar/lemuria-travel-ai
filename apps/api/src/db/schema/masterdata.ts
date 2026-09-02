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
import { primaryId, timestamps } from './_shared.js';
import { users } from './auth.js';

/**
 * Master data — business configuration the application does NOT branch on.
 * Admins edit these at runtime instead of asking for a code change (spec §40).
 */

export const leadSources = pgTable(
  'lead_sources',
  {
    id: primaryId(),
    key: varchar('key', { length: 40 }).notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    /** Hex colour used by dashboard charts and badges. */
    colour: varchar('colour', { length: 9 }),
    icon: varchar('icon', { length: 40 }),
    /** 0-100 intent weight used by the lead scoring engine. */
    scoreWeight: integer('score_weight').notNull().default(50),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('lead_sources_key_idx').on(t.key)],
);

export const travelTypes = pgTable(
  'travel_types',
  {
    id: primaryId(),
    key: varchar('key', { length: 40 }).notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('travel_types_key_idx').on(t.key)],
);

export const destinations = pgTable(
  'destinations',
  {
    id: primaryId(),
    name: varchar('name', { length: 120 }).notNull(),
    countryCode: varchar('country_code', { length: 2 }),
    region: varchar('region', { length: 80 }),
    isDomestic: boolean('is_domestic').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [index('destinations_name_idx').on(t.name)],
);

/** Countries Lemuria files visas for. Phase 1 scope: 26 seeded countries (spec §19). */
export const visaCountries = pgTable(
  'visa_countries',
  {
    id: primaryId(),
    countryCode: varchar('country_code', { length: 2 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    /** Typical processing window, surfaced as an SLA hint on the case. */
    processingDaysMin: integer('processing_days_min'),
    processingDaysMax: integer('processing_days_max'),
    embassyNotes: text('embassy_notes'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('visa_countries_code_idx').on(t.countryCode)],
);

export const visaTypes = pgTable(
  'visa_types',
  {
    id: primaryId(),
    visaCountryId: uuid('visa_country_id').notNull().references(() => visaCountries.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 40 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    validityDays: integer('validity_days'),
    entryType: varchar('entry_type', { length: 20 }),
    governmentFee: integer('government_fee_paise'),
    serviceFee: integer('service_fee_paise'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('visa_types_country_key_idx').on(t.visaCountryId, t.key)],
);

/**
 * Country-wise document checklists. Driven entirely from the database — the UI
 * renders whatever rows exist and never hardcodes per-country logic (spec §19).
 */
export const visaChecklistTemplates = pgTable(
  'visa_checklist_templates',
  {
    id: primaryId(),
    visaCountryId: uuid('visa_country_id').notNull().references(() => visaCountries.id, { onDelete: 'cascade' }),
    visaTypeId: uuid('visa_type_id').references(() => visaTypes.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    /** Applies only to travellers matching this predicate, e.g. {"minAge":18}. */
    appliesWhen: jsonb('applies_when').$type<Record<string, unknown>>(),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [index('visa_checklist_templates_country_idx').on(t.visaCountryId)],
);

export const visaChecklistTemplateItems = pgTable(
  'visa_checklist_template_items',
  {
    id: primaryId(),
    templateId: uuid('template_id').notNull().references(() => visaChecklistTemplates.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 200 }).notNull(),
    description: text('description'),
    isMandatory: boolean('is_mandatory').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('visa_checklist_items_template_idx').on(t.templateId, t.sortOrder)],
);

export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: primaryId(),
    key: varchar('key', { length: 40 }).notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    requiresReference: boolean('requires_reference').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('payment_methods_key_idx').on(t.key)],
);

export const supplierTypes = pgTable(
  'supplier_types',
  {
    id: primaryId(),
    key: varchar('key', { length: 40 }).notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('supplier_types_key_idx').on(t.key)],
);

/**
 * Tax rates, per service category.
 *
 * Deliberately data rather than code. Indian travel GST has more than one
 * defensible treatment — 5% on gross without input credit, 18% with it, and
 * margin schemes for tour operators — and which applies depends on the service,
 * on domestic versus outbound, and on the client's accountant. Seeding a rate
 * is not the same as knowing it is right, so every row carries `isProvisional`
 * and the quotation shows it until an accountant confirms otherwise.
 */
export const taxRates = pgTable(
  'tax_rates',
  {
    id: primaryId(),
    /** hotel, flight, transfer, activity, visa, insurance, package, misc */
    serviceCategory: varchar('service_category', { length: 40 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    /** Rate in basis points. 500 = 5%. */
    rateBps: integer('rate_bps').notNull(),
    /** GROSS | MARGIN | EXEMPT — what the rate is charged on. */
    basis: varchar('basis', { length: 12 }).notNull().default('GROSS'),
    /** Whether input tax credit may be claimed under this treatment. */
    inputCreditAllowed: boolean('input_credit_allowed').notNull().default(false),
    /** True for domestic-only or outbound-only rules; null applies to both. */
    appliesToDomestic: boolean('applies_to_domestic'),

    /** Set false only once a qualified accountant has confirmed the treatment. */
    isProvisional: boolean('is_provisional').notNull().default(true),
    /** Statutory reference, so the choice is auditable rather than folklore. */
    authorityNote: text('authority_note'),

    effectiveFrom: date('effective_from'),
    effectiveTo: date('effective_to'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index('tax_rates_category_idx').on(t.serviceCategory, t.isActive),
    index('tax_rates_effective_idx').on(t.effectiveFrom, t.effectiveTo),
  ],
);

/** Application settings as typed key/value rows, editable by ADMIN. */
export const settings = pgTable(
  'settings',
  {
    id: primaryId(),
    key: varchar('key', { length: 80 }).notNull(),
    value: jsonb('value').notNull(),
    description: text('description'),
    updatedById: uuid('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [uniqueIndex('settings_key_idx').on(t.key)],
);
