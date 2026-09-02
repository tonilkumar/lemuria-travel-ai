import { z } from 'zod';
import { DOCUMENT_TYPES } from '../domain/enums.js';
import { dateOnly, paginationSchema } from './api.js';

/**
 * Upload metadata. The file itself arrives as multipart; these fields travel
 * alongside it, so every value is a string on the wire and coerced here.
 */
export const uploadDocumentSchema = z.object({
  customerId: z.string().uuid().optional(),
  entityType: z.enum(['visa_case', 'passport_case', 'quotation', 'itinerary', 'booking']).optional(),
  entityId: z.string().uuid().optional(),
  type: z.enum(DOCUMENT_TYPES),
  title: z.string().trim().min(1, 'Give the document a title').max(200),
  expiresOn: dateOnly.optional(),
  /**
   * Full ID number for a passport or visa. Stored masked, never in the clear;
   * a peppered fingerprint is kept so duplicates can still be detected.
   */
  referenceNumber: z.string().trim().max(40).optional(),
  /** Supersede this document rather than adding a second one. */
  replacesDocumentId: z.string().uuid().optional(),
  replacedReason: z.string().trim().max(500).optional(),
});

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;

export const documentListQuerySchema = paginationSchema.extend({
  customerId: z.string().uuid().optional(),
  entityType: z.string().trim().max(40).optional(),
  entityId: z.string().uuid().optional(),
  type: z.union([z.enum(DOCUMENT_TYPES), z.array(z.enum(DOCUMENT_TYPES))]).optional(),
  search: z.string().trim().max(120).optional(),
  /** Documents expiring within N days, for the alert queues. */
  expiringInDays: z.coerce.number().int().min(1).max(1095).optional(),
  expired: z.coerce.boolean().optional(),
});

export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;

export const verifyDocumentSchema = z.object({
  verified: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

/**
 * Upload limits, shared so the browser can reject an oversized file before
 * spending the upload rather than after. The server enforces them again.
 */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

/** Extension allow-list, checked against the sniffed type rather than trusted. */
export const ALLOWED_DOCUMENT_EXTENSIONS = [
  '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.doc', '.docx', '.xls', '.xlsx',
] as const;

export function isAllowedDocumentMime(mime: string): boolean {
  return (ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(mime);
}

/**
 * Expiry alert thresholds. The proposal calls for warnings at 12 and 6 months;
 * 3 months and 1 month are added because a passport inside 3 months blocks most
 * visa applications outright and needs a louder signal than "expiring".
 */
export const EXPIRY_THRESHOLDS = [
  { days: 365, label: '12 months', severity: 'INFO' },
  { days: 180, label: '6 months', severity: 'WARN' },
  { days: 90, label: '3 months', severity: 'URGENT' },
  { days: 30, label: '1 month', severity: 'CRITICAL' },
] as const;

export type ExpirySeverity = (typeof EXPIRY_THRESHOLDS)[number]['severity'];

/** Highest-severity threshold a given number of days-to-expiry falls inside. */
export function expirySeverity(daysToExpiry: number | null): ExpirySeverity | null {
  if (daysToExpiry === null) return null;
  if (daysToExpiry < 0) return 'CRITICAL';
  for (const t of [...EXPIRY_THRESHOLDS].reverse()) {
    if (daysToExpiry <= t.days) return t.severity;
  }
  return null;
}
