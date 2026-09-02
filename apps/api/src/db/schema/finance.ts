import {
  boolean,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { money, primaryId, timestamps } from './_shared.js';
import { users } from './auth.js';
import { customers } from './customers.js';
import { documents } from './documents.js';
import { itineraries } from './itineraries.js';
import { leads } from './leads.js';
import { paymentMethods, supplierTypes } from './masterdata.js';
import { quotations, quotationVersions } from './quotations.js';

/**
 * Phase 1 finance is deliberately basic (spec §26): what was sold, what came
 * in, what is still outstanding, and what the supplier costs. Full accounting
 * and Tally integration are Phase 2.
 */
export const bookings = pgTable(
  'bookings',
  {
    id: primaryId(),
    bookingCode: varchar('booking_code', { length: 32 }).notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    quotationId: uuid('quotation_id').references(() => quotations.id, { onDelete: 'set null' }),
    quotationVersionId: uuid('quotation_version_id').references(() => quotationVersions.id, {
      onDelete: 'set null',
    }),
    itineraryId: uuid('itinerary_id').references(() => itineraries.id, { onDelete: 'set null' }),

    /** CONFIRMED | IN_PROGRESS | TRAVELLED | CANCELLED */
    status: varchar('status', { length: 20 }).notNull().default('CONFIRMED'),
    travelStartDate: date('travel_start_date'),
    travelEndDate: date('travel_end_date'),

    totalAmount: money('total_amount').notNull().default(0),
    amountReceived: money('amount_received').notNull().default(0),
    /** Persisted rather than derived so overdue queries stay indexable. */
    amountOutstanding: money('amount_outstanding').notNull().default(0),
    supplierCostTotal: money('supplier_cost_total').notNull().default(0),

    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),

    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('bookings_code_idx').on(t.bookingCode),
    index('bookings_customer_idx').on(t.customerId),
    index('bookings_status_idx').on(t.status, t.createdAt),
    index('bookings_travel_dates_idx').on(t.travelStartDate),
    index('bookings_outstanding_idx').on(t.amountOutstanding),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: primaryId(),
    paymentCode: varchar('payment_code', { length: 32 }).notNull(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),

    /** Positive for receipts, negative for refunds. Never delete a payment row. */
    amount: money('amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('INR'),
    paymentMethodId: uuid('payment_method_id').references(() => paymentMethods.id, {
      onDelete: 'set null',
    }),
    referenceNumber: varchar('reference_number', { length: 120 }),
    paidOn: date('paid_on').notNull(),
    notes: text('notes'),

    isRefund: boolean('is_refund').notNull().default(false),
    reversesPaymentId: uuid('reverses_payment_id'),

    receiptDocumentId: uuid('receipt_document_id').references(() => documents.id, {
      onDelete: 'set null',
    }),
    recordedById: uuid('recorded_by_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('payments_code_idx').on(t.paymentCode),
    index('payments_booking_idx').on(t.bookingId, t.paidOn),
    index('payments_customer_idx').on(t.customerId),
    index('payments_paid_on_idx').on(t.paidOn),
  ],
);

export const suppliers = pgTable(
  'suppliers',
  {
    id: primaryId(),
    supplierCode: varchar('supplier_code', { length: 32 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    supplierTypeId: uuid('supplier_type_id').references(() => supplierTypes.id, {
      onDelete: 'set null',
    }),
    contactPerson: varchar('contact_person', { length: 160 }),
    phone: varchar('phone', { length: 20 }),
    email: varchar('email', { length: 254 }),
    city: varchar('city', { length: 80 }),
    country: varchar('country', { length: 80 }),
    gstNumber: varchar('gst_number', { length: 20 }),
    paymentTerms: varchar('payment_terms', { length: 120 }),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('suppliers_code_idx').on(t.supplierCode),
    index('suppliers_name_idx').on(t.name),
  ],
);

export const supplierRates = pgTable(
  'supplier_rates',
  {
    id: primaryId(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    serviceName: varchar('service_name', { length: 200 }).notNull(),
    category: varchar('category', { length: 40 }),
    destination: varchar('destination', { length: 160 }),
    unit: varchar('unit', { length: 40 }),
    rate: money('rate').notNull().default(0),
    currency: varchar('currency', { length: 3 }).notNull().default('INR'),
    validFrom: date('valid_from'),
    validTo: date('valid_to'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index('supplier_rates_supplier_idx').on(t.supplierId),
    index('supplier_rates_validity_idx').on(t.validFrom, t.validTo),
  ],
);

/** What Lemuria owes a supplier for a specific booking. */
export const supplierPayables = pgTable(
  'supplier_payables',
  {
    id: primaryId(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    description: varchar('description', { length: 300 }),
    amount: money('amount').notNull().default(0),
    amountPaid: money('amount_paid').notNull().default(0),
    dueOn: date('due_on'),
    status: varchar('status', { length: 20 }).notNull().default('PENDING'),
    ...timestamps,
  },
  (t) => [
    index('supplier_payables_booking_idx').on(t.bookingId),
    index('supplier_payables_supplier_idx').on(t.supplierId, t.status),
  ],
);
