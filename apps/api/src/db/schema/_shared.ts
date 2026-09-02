import { sql } from 'drizzle-orm';
import { bigint, pgEnum, timestamp, uuid } from 'drizzle-orm/pg-core';
import {
  AI_REVIEW_STATUSES,
  COMMUNICATION_CHANNELS,
  COMMUNICATION_DIRECTIONS,
  CUSTOMER_TIERS,
  DOCUMENT_TYPES,
  FOLLOWUP_STATUSES,
  FOLLOWUP_TYPES,
  LEAD_CLASSIFICATIONS,
  LEAD_STATUSES,
  PASSPORT_APPLICATION_TYPES,
  PRIORITIES,
  QUOTATION_STATUSES,
  VISA_WORKFLOW_STEPS,
} from '@lemuria/shared';

/** Postgres enums mirror the structural enums in @lemuria/shared. */
export const leadStatusEnum = pgEnum('lead_status', LEAD_STATUSES);
export const leadClassificationEnum = pgEnum('lead_classification', LEAD_CLASSIFICATIONS);
export const followupStatusEnum = pgEnum('followup_status', FOLLOWUP_STATUSES);
export const followupTypeEnum = pgEnum('followup_type', FOLLOWUP_TYPES);
export const priorityEnum = pgEnum('priority', PRIORITIES);
export const customerTierEnum = pgEnum('customer_tier', CUSTOMER_TIERS);
export const documentTypeEnum = pgEnum('document_type', DOCUMENT_TYPES);
export const quotationStatusEnum = pgEnum('quotation_status', QUOTATION_STATUSES);
export const visaWorkflowStepEnum = pgEnum('visa_workflow_step', VISA_WORKFLOW_STEPS);
export const passportApplicationTypeEnum = pgEnum('passport_application_type', PASSPORT_APPLICATION_TYPES);
export const communicationChannelEnum = pgEnum('communication_channel', COMMUNICATION_CHANNELS);
export const communicationDirectionEnum = pgEnum('communication_direction', COMMUNICATION_DIRECTIONS);
export const aiReviewStatusEnum = pgEnum('ai_review_status', AI_REVIEW_STATUSES);

export const primaryId = () => uuid('id').primaryKey().defaultRandom();

/** Every business table carries these. Soft delete keeps the audit trail intact. */
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};

export const now = sql`now()`;

/**
 * Money is stored as integer paise (1 INR = 100 paise). Never use float/double
 * for money — rounding drift becomes real rupees on a quotation with markup+GST.
 * bigint keeps headroom well past integer's ~₹2.1 crore ceiling.
 */
export const money = (name: string) => bigint(name, { mode: 'number' });
