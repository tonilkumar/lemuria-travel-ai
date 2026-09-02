/**
 * Structural enums — application logic branches on these values, so they live in
 * code and are enforced by database CHECK constraints.
 *
 * Business configuration that logic does NOT branch on (lead sources, travel
 * types, visa countries, payment methods, templates…) is master data and lives
 * in database tables, editable by admins. See docs/DATABASE.md.
 */

export const ROLES = ['ADMIN', 'MANAGER', 'EXECUTIVE', 'FINANCE', 'OPERATIONS'] as const;
export type Role = (typeof ROLES)[number];

export const LEAD_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'QUOTATION_SENT',
  'CONVERTED',
  'LOST',
  'NO_RESPONSE',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_CLASSIFICATIONS = ['HOT', 'WARM', 'COLD'] as const;
export type LeadClassification = (typeof LEAD_CLASSIFICATIONS)[number];

export const FOLLOWUP_STATUSES = ['PENDING', 'COMPLETED', 'OVERDUE', 'CANCELLED'] as const;
export type FollowupStatus = (typeof FOLLOWUP_STATUSES)[number];

export const FOLLOWUP_TYPES = [
  'CALL',
  'WHATSAPP',
  'EMAIL',
  'MEETING',
  'DOCUMENT_COLLECTION',
  'QUOTATION_FOLLOWUP',
  'PAYMENT_FOLLOWUP',
  'VISA_FOLLOWUP',
  'OTHER',
] as const;
export type FollowupType = (typeof FOLLOWUP_TYPES)[number];

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CUSTOMER_TIERS = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'] as const;
export type CustomerTier = (typeof CUSTOMER_TIERS)[number];

export const DOCUMENT_TYPES = [
  'PASSPORT',
  'VISA',
  'PHOTO',
  'IDENTITY_PROOF',
  'QUOTATION',
  'ITINERARY',
  'INVOICE',
  'RECEIPT',
  'TICKET',
  'TRAVEL_DOCUMENT',
  'OTHER',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Document classes that require elevated access control and audit (spec §28). */
export const SENSITIVE_DOCUMENT_TYPES: readonly DocumentType[] = [
  'PASSPORT',
  'VISA',
  'IDENTITY_PROOF',
];

export const QUOTATION_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'SENT',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

/** Visa case workflow — 12 ordered steps (spec §19). */
export const VISA_WORKFLOW_STEPS = [
  'CASE_CREATED',
  'DOCUMENTS_REQUIRED',
  'DOCUMENTS_SUBMITTED',
  'DOCUMENTS_VERIFIED',
  'APPOINTMENT_SCHEDULED',
  'APPLICATION_SUBMITTED',
  'BIOMETRICS_COMPLETED',
  'PROCESSING',
  'DECISION_RECEIVED',
  'PASSPORT_COLLECTED',
  'DELIVERED_TO_CUSTOMER',
  'COMPLETED',
] as const;
export type VisaWorkflowStep = (typeof VISA_WORKFLOW_STEPS)[number];

export const PASSPORT_APPLICATION_TYPES = ['NEW', 'RENEWAL', 'TATKAL'] as const;
export type PassportApplicationType = (typeof PASSPORT_APPLICATION_TYPES)[number];

export const COMMUNICATION_CHANNELS = ['WHATSAPP', 'EMAIL', 'PHONE', 'SMS', 'IN_PERSON'] as const;
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

export const COMMUNICATION_DIRECTIONS = ['INBOUND', 'OUTBOUND'] as const;
export type CommunicationDirection = (typeof COMMUNICATION_DIRECTIONS)[number];

/** AI output lifecycle — nothing customer-facing is sent unreviewed (spec §24). */
export const AI_REVIEW_STATUSES = ['GENERATED', 'EDITED', 'APPROVED', 'REJECTED', 'SENT'] as const;
export type AiReviewStatus = (typeof AI_REVIEW_STATUSES)[number];
