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
import { money, primaryId, quotationStatusEnum, timestamps } from './_shared.js';
import { users } from './auth.js';
import { customers } from './customers.js';
import { leads } from './leads.js';

/**
 * A quotation is versioned: V1, V2, V3 are rows in quotation_versions sharing
 * one quotation. The quotation row holds identity and current pointer only, so
 * a sent version can never be mutated after the fact.
 */
export const quotations = pgTable(
  'quotations',
  {
    id: primaryId(),
    quotationCode: varchar('quotation_code', { length: 32 }).notNull(),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),

    title: varchar('title', { length: 200 }).notNull(),
    destination: varchar('destination', { length: 160 }),
    travelStartDate: date('travel_start_date'),
    travelEndDate: date('travel_end_date'),
    travellersAdults: integer('travellers_adults').notNull().default(1),
    travellersChildren: integer('travellers_children').notNull().default(0),

    currentVersionId: uuid('current_version_id'),
    status: quotationStatusEnum('status').notNull().default('DRAFT'),
    validUntil: date('valid_until'),

    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('quotations_code_idx').on(t.quotationCode),
    index('quotations_customer_idx').on(t.customerId),
    index('quotations_lead_idx').on(t.leadId),
    index('quotations_status_idx').on(t.status, t.createdAt),
  ],
);

export const quotationVersions = pgTable(
  'quotation_versions',
  {
    id: primaryId(),
    quotationId: uuid('quotation_id')
      .notNull()
      .references(() => quotations.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    status: quotationStatusEnum('status').notNull().default('DRAFT'),

    /** Narrative copy, AI-draftable but always human-approved before send. */
    introText: text('intro_text'),
    inclusions: jsonb('inclusions').$type<string[]>().default([]),
    exclusions: jsonb('exclusions').$type<string[]>().default([]),
    termsText: text('terms_text'),

    /** Rolled up from packages; recomputed server-side, never trusted from the client. */
    totalSupplierCost: money('total_supplier_cost').notNull().default(0),
    totalOtherCost: money('total_other_cost').notNull().default(0),
    totalMarkup: money('total_markup').notNull().default(0),
    totalDiscount: money('total_discount').notNull().default(0),
    totalNetBeforeTax: money('total_net_before_tax').notNull().default(0),
    totalTaxable: money('total_taxable').notNull().default(0),
    totalGst: money('total_gst').notNull().default(0),
    totalSellingPrice: money('total_selling_price').notNull().default(0),
    marginAmount: money('margin_amount').notNull().default(0),
    /** Stored in basis points to avoid float drift, e.g. 1875 = 18.75%. */
    marginBps: integer('margin_bps').notNull().default(0),

    /** Why this version needed approval, if it did. Recorded at calculation
     *  time so the reason survives a later threshold change. */
    approvalTriggers: jsonb('approval_triggers').$type<string[]>().default([]),
    /** True when any package used a tax rate still marked provisional. */
    taxIsProvisional: boolean('tax_is_provisional').notNull().default(true),

    aiGenerationId: uuid('ai_generation_id'),
    pdfDocumentId: uuid('pdf_document_id'),

    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('quotation_versions_unique_idx').on(t.quotationId, t.versionNumber),
    index('quotation_versions_quotation_idx').on(t.quotationId),
  ],
);

/** Package tiers within a version, e.g. Silver / Gold / Platinum. */
export const quotationPackages = pgTable(
  'quotation_packages',
  {
    id: primaryId(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => quotationVersions.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    description: text('description'),
    isRecommended: boolean('is_recommended').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),

    // ── Costing. Every figure is written by the shared costing engine; nothing
    // here is edited directly, so the stored totals always reconcile.
    supplierCost: money('supplier_cost').notNull().default(0),
    otherCost: money('other_cost').notNull().default(0),
    baseCost: money('base_cost').notNull().default(0),

    markupBps: integer('markup_bps').notNull().default(0),
    /** Set when the executive typed a flat markup instead of a percentage. */
    markupOverride: money('markup_override'),
    markupAmount: money('markup_amount').notNull().default(0),

    discountBps: integer('discount_bps').notNull().default(0),
    discountOverride: money('discount_override'),
    discountAmount: money('discount_amount').notNull().default(0),
    discountReason: text('discount_reason'),

    netBeforeTax: money('net_before_tax').notNull().default(0),

    /** Snapshot of the tax treatment applied, not a live reference: a rate
     *  change must not silently alter a quotation already sent. */
    taxRateId: uuid('tax_rate_id'),
    gstBps: integer('gst_bps').notNull().default(0),
    taxBasis: varchar('tax_basis', { length: 12 }).notNull().default('GROSS'),
    taxableValue: money('taxable_value').notNull().default(0),
    gstAmount: money('gst_amount').notNull().default(0),
    /** True when the applied rate was still awaiting accountant confirmation. */
    taxIsProvisional: boolean('tax_is_provisional').notNull().default(true),

    sellingPrice: money('selling_price').notNull().default(0),
    marginAmount: money('margin_amount').notNull().default(0),
    marginBps: integer('margin_bps').notNull().default(0),

    travellerCount: integer('traveller_count').notNull().default(0),
    perPersonPrice: money('per_person_price'),
    ...timestamps,
  },
  (t) => [index('quotation_packages_version_idx').on(t.versionId, t.sortOrder)],
);

export const quotationItems = pgTable(
  'quotation_items',
  {
    id: primaryId(),
    packageId: uuid('package_id')
      .notNull()
      .references(() => quotationPackages.id, { onDelete: 'cascade' }),
    /** hotel, flight, transfer, activity, visa, insurance, misc */
    category: varchar('category', { length: 40 }).notNull(),
    description: varchar('description', { length: 300 }).notNull(),
    supplierId: uuid('supplier_id'),
    quantity: integer('quantity').notNull().default(1),
    unitCost: money('unit_cost').notNull().default(0),
    totalCost: money('total_cost').notNull().default(0),
    dayNumber: integer('day_number'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('quotation_items_package_idx').on(t.packageId, t.sortOrder)],
);

/**
 * Approval trail. A version above the configured value threshold, or below the
 * configured margin floor, cannot move to SENT without an APPROVED row here.
 */
export const quotationApprovals = pgTable(
  'quotation_approvals',
  {
    id: primaryId(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => quotationVersions.id, { onDelete: 'cascade' }),
    requestedById: uuid('requested_by_id').references(() => users.id, { onDelete: 'set null' }),
    decidedById: uuid('decided_by_id').references(() => users.id, { onDelete: 'set null' }),
    decision: varchar('decision', { length: 20 }).notNull().default('PENDING'),
    /** Why approval was needed, e.g. HIGH_VALUE or LOW_MARGIN. */
    triggerReason: varchar('trigger_reason', { length: 60 }),
    comments: text('comments'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('quotation_approvals_version_idx').on(t.versionId, t.createdAt)],
);
