import { z } from 'zod';
import { QUOTATION_STATUSES } from '../domain/enums.js';
import { dateOnly, paginationSchema } from './api.js';

/**
 * Service categories a quotation line can belong to. Tax rates are configured
 * per category, so this list is structural: adding one needs a matching rate.
 */
export const SERVICE_CATEGORIES = [
  'HOTEL',
  'FLIGHT',
  'TRANSFER',
  'ACTIVITY',
  'MEAL',
  'GUIDE',
  'VISA',
  'INSURANCE',
  'PERMIT',
  'MISC',
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

/** Categories billed through at cost, where a markup would be inappropriate. */
export const PASS_THROUGH_CATEGORIES: readonly ServiceCategory[] = ['VISA', 'PERMIT', 'INSURANCE'];

export const createQuotationSchema = z.object({
  customerId: z.string().uuid({ message: 'Choose a customer' }),
  leadId: z.string().uuid().optional(),
  title: z.string().trim().min(3, 'Give the quotation a title').max(200),
  destination: z.string().trim().max(160).optional(),
  travelStartDate: dateOnly.optional(),
  travelEndDate: dateOnly.optional(),
  travellersAdults: z.coerce.number().int().min(1).max(99).default(1),
  travellersChildren: z.coerce.number().int().min(0).max(99).default(0),
  validUntil: dateOnly.optional(),
  ownerId: z.string().uuid().optional(),
});

export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;

export const updateQuotationSchema = createQuotationSchema.partial().omit({ customerId: true });

export const quotationListQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.union([z.enum(QUOTATION_STATUSES), z.array(z.enum(QUOTATION_STATUSES))]).optional(),
  customerId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  mine: z.coerce.boolean().optional(),
  /** Only versions currently waiting on a manager. */
  awaitingApproval: z.coerce.boolean().optional(),
  createdFrom: dateOnly.optional(),
  createdTo: dateOnly.optional(),
});

export type QuotationListQuery = z.infer<typeof quotationListQuerySchema>;

export const quotationItemSchema = z.object({
  id: z.string().uuid().optional(),
  category: z.enum(SERVICE_CATEGORIES),
  description: z.string().trim().min(1, 'Describe the service').max(300),
  supplierId: z.string().uuid().optional(),
  quantity: z.coerce.number().int().min(1).max(9999).default(1),
  /** Supplier cost per unit, in rupees. Converted to paise server-side. */
  unitCost: z.coerce.number().min(0).max(100_000_000),
  dayNumber: z.coerce.number().int().min(0).max(365).optional(),
  /** Billed at cost with no markup — visa fees, permits, insurance. */
  isPassThrough: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export type QuotationItemInput = z.infer<typeof quotationItemSchema>;

/**
 * A package tier within a version.
 *
 * Costing inputs only. Every derived figure — markup amount, tax, selling
 * price, margin — is computed by the server from these and never accepted from
 * the client, so a tampered request cannot produce a quotation whose totals do
 * not reconcile with its lines.
 */
export const upsertPackageSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, 'Name the package').max(80),
    description: z.string().trim().max(1000).optional(),
    isRecommended: z.boolean().default(false),
    sortOrder: z.coerce.number().int().min(0).default(0),

    markupBps: z.coerce.number().int().min(0).max(50_000).default(0),
    /** Flat markup in rupees; wins over the percentage when set. */
    markupOverride: z.coerce.number().min(0).max(100_000_000).optional(),

    discountBps: z.coerce.number().int().min(0).max(10_000).default(0),
    discountOverride: z.coerce.number().min(0).max(100_000_000).optional(),
    discountReason: z.string().trim().max(500).optional(),

    /** Omit to use the configured rate for the package's dominant category. */
    taxRateId: z.string().uuid().optional(),

    travellerCount: z.coerce.number().int().min(0).max(999).default(0),
    items: z.array(quotationItemSchema).max(200).default([]),
  })
  // A discount always needs a reason on the record. Margin given away without
  // an explanation is the thing a manager cannot review later.
  .refine(
    (v) =>
      v.discountBps === 0 && v.discountOverride === undefined ? true : Boolean(v.discountReason),
    { message: 'Record why a discount is being given', path: ['discountReason'] },
  );

export type UpsertPackageInput = z.infer<typeof upsertPackageSchema>;

export const updateVersionContentSchema = z.object({
  introText: z.string().trim().max(8000).optional(),
  inclusions: z.array(z.string().trim().max(300)).max(60).optional(),
  exclusions: z.array(z.string().trim().max(300)).max(60).optional(),
  termsText: z.string().trim().max(8000).optional(),
});

export type UpdateVersionContentInput = z.infer<typeof updateVersionContentSchema>;

export const approveQuotationSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  comments: z.string().trim().max(2000).optional(),
});

export const sendQuotationSchema = z.object({
  channel: z.enum(['EMAIL', 'WHATSAPP', 'MANUAL']).default('MANUAL'),
  note: z.string().trim().max(2000).optional(),
});

/** AI drafting request. Output always lands in review, never straight into the quote. */
export const generateQuotationContentSchema = z.object({
  kind: z.enum(['INTRO', 'INCLUSIONS', 'EXCLUSIONS', 'TERMS']),
  tone: z.enum(['WARM', 'CONCISE', 'PREMIUM']).default('WARM'),
  extraGuidance: z.string().trim().max(1000).optional(),
});

export type GenerateQuotationContentInput = z.infer<typeof generateQuotationContentSchema>;

/**
 * Status transitions a quotation version may make.
 *
 * SENT is terminal for editing: a version the customer has seen is frozen, and
 * changing the price means a new version. That is the whole reason versions
 * exist (spec §17).
 */
const VERSION_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ['PENDING_APPROVAL', 'APPROVED', 'SENT'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'DRAFT'],
  APPROVED: ['SENT', 'DRAFT'],
  REJECTED: ['DRAFT'],
  SENT: ['ACCEPTED', 'DECLINED', 'EXPIRED'],
  ACCEPTED: [],
  DECLINED: [],
  EXPIRED: [],
};

export function canTransitionQuotation(from: string, to: string): boolean {
  if (from === to) return true;
  return (VERSION_TRANSITIONS[from] ?? []).includes(to);
}

export function isVersionEditable(status: string): boolean {
  return status === 'DRAFT' || status === 'REJECTED';
}
