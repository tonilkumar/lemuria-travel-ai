import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  money,
  passportApplicationTypeEnum,
  primaryId,
  timestamps,
  visaWorkflowStepEnum,
} from './_shared.js';
import { users } from './auth.js';
import { customers } from './customers.js';
import { documents } from './documents.js';
import { visaChecklistTemplates, visaCountries, visaTypes } from './masterdata.js';

/** One visa application for one traveller. A family of four is four cases. */
export const visaCases = pgTable(
  'visa_cases',
  {
    id: primaryId(),
    caseCode: varchar('case_code', { length: 32 }).notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    visaCountryId: uuid('visa_country_id')
      .notNull()
      .references(() => visaCountries.id, { onDelete: 'restrict' }),
    visaTypeId: uuid('visa_type_id').references(() => visaTypes.id, { onDelete: 'set null' }),
    checklistTemplateId: uuid('checklist_template_id').references(() => visaChecklistTemplates.id, {
      onDelete: 'set null',
    }),

    currentStep: visaWorkflowStepEnum('current_step').notNull().default('CASE_CREATED'),
    travelDate: date('travel_date'),
    appointmentAt: timestamp('appointment_at', { withTimezone: true }),
    appointmentLocation: varchar('appointment_location', { length: 200 }),

    /** Outcome once the embassy decides: APPROVED | REJECTED | WITHDRAWN */
    decision: varchar('decision', { length: 20 }),
    decisionAt: timestamp('decision_at', { withTimezone: true }),
    decisionNotes: text('decision_notes'),
    visaNumberMasked: varchar('visa_number_masked', { length: 40 }),
    visaValidFrom: date('visa_valid_from'),
    visaValidTo: date('visa_valid_to'),

    governmentFee: money('government_fee').notNull().default(0),
    serviceFee: money('service_fee').notNull().default(0),
    feeCollected: money('fee_collected').notNull().default(0),

    assignedToId: uuid('assigned_to_id').references(() => users.id, { onDelete: 'set null' }),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('visa_cases_code_idx').on(t.caseCode),
    index('visa_cases_customer_idx').on(t.customerId),
    index('visa_cases_step_idx').on(t.currentStep),
    index('visa_cases_assigned_idx').on(t.assignedToId, t.currentStep),
    index('visa_cases_travel_date_idx').on(t.travelDate),
  ],
);

/**
 * Checklist items copied from the country template at case creation, so
 * editing a template later never rewrites the requirements of a live case.
 */
export const visaChecklistItems = pgTable(
  'visa_checklist_items',
  {
    id: primaryId(),
    visaCaseId: uuid('visa_case_id')
      .notNull()
      .references(() => visaCases.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 200 }).notNull(),
    description: text('description'),
    isMandatory: boolean('is_mandatory').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),

    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    /** PENDING | SUBMITTED | VERIFIED | REJECTED */
    status: varchar('status', { length: 20 }).notNull().default('PENDING'),
    rejectionReason: text('rejection_reason'),
    verifiedById: uuid('verified_by_id').references(() => users.id, { onDelete: 'set null' }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('visa_checklist_items_case_idx').on(t.visaCaseId, t.sortOrder)],
);

/** Timestamped step transitions - the audit backbone of the 12-step workflow. */
export const visaStatusHistory = pgTable(
  'visa_status_history',
  {
    id: primaryId(),
    visaCaseId: uuid('visa_case_id')
      .notNull()
      .references(() => visaCases.id, { onDelete: 'cascade' }),
    fromStep: visaWorkflowStepEnum('from_step'),
    toStep: visaWorkflowStepEnum('to_step').notNull(),
    notes: text('notes'),
    changedById: uuid('changed_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('visa_status_history_case_idx').on(t.visaCaseId, t.createdAt)],
);

/** Passport application handling, separate from the passport document itself. */
export const passportCases = pgTable(
  'passport_cases',
  {
    id: primaryId(),
    caseCode: varchar('case_code', { length: 32 }).notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    applicationType: passportApplicationTypeEnum('application_type').notNull(),

    /** DOCUMENTS_PENDING | VERIFIED | APPOINTMENT_BOOKED | APPLIED |
     *  POLICE_VERIFICATION | DISPATCHED | DELIVERED | COMPLETED | REJECTED */
    status: varchar('status', { length: 30 }).notNull().default('DOCUMENTS_PENDING'),
    applicationNumber: varchar('application_number', { length: 40 }),
    appointmentAt: timestamp('appointment_at', { withTimezone: true }),
    appointmentLocation: varchar('appointment_location', { length: 200 }),

    policeVerificationStatus: varchar('police_verification_status', { length: 30 }),
    policeVerificationAt: timestamp('police_verification_at', { withTimezone: true }),

    governmentFee: money('government_fee').notNull().default(0),
    serviceFee: money('service_fee').notNull().default(0),
    feeCollected: money('fee_collected').notNull().default(0),

    assignedToId: uuid('assigned_to_id').references(() => users.id, { onDelete: 'set null' }),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('passport_cases_code_idx').on(t.caseCode),
    index('passport_cases_customer_idx').on(t.customerId),
    index('passport_cases_status_idx').on(t.status),
  ],
);

export const passportStatusHistory = pgTable(
  'passport_status_history',
  {
    id: primaryId(),
    passportCaseId: uuid('passport_case_id')
      .notNull()
      .references(() => passportCases.id, { onDelete: 'cascade' }),
    fromStatus: varchar('from_status', { length: 30 }),
    toStatus: varchar('to_status', { length: 30 }).notNull(),
    notes: text('notes'),
    changedById: uuid('changed_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('passport_status_history_case_idx').on(t.passportCaseId, t.createdAt)],
);

/**
 * Passport records held on file, driving the 12-month and 6-month expiry
 * alerts. The number is stored masked; the scan lives in documents.
 */
export const customerPassports = pgTable(
  'customer_passports',
  {
    id: primaryId(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    passportNumberMasked: varchar('passport_number_masked', { length: 40 }).notNull(),
    /** Deterministic hash so a duplicate passport can be detected without storing the number. */
    passportNumberHash: varchar('passport_number_hash', { length: 64 }),
    fullNameOnPassport: varchar('full_name_on_passport', { length: 200 }),
    nationality: varchar('nationality', { length: 60 }).default('Indian'),
    issuedOn: date('issued_on'),
    expiresOn: date('expires_on'),
    placeOfIssue: varchar('place_of_issue', { length: 120 }),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    isPrimary: boolean('is_primary').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index('customer_passports_customer_idx').on(t.customerId),
    index('customer_passports_expiry_idx').on(t.expiresOn),
  ],
);
