import { z } from 'zod';
import {
  LEAD_CLASSIFICATIONS,
  LEAD_STATUSES,
  FOLLOWUP_STATUSES,
  FOLLOWUP_TYPES,
  PRIORITIES,
} from '../domain/enums.js';
import { dateOnly, emailSchema, paginationSchema, phoneSchema } from './api.js';

/**
 * Quick Enquiry — optimised so an executive can file a lead in under 30 seconds
 * (spec §11). Only name + phone are mandatory; everything else is optional and
 * must never block creation.
 */
export const createLeadSchema = z.object({
  customerName: z.string().trim().min(2, 'Name is required').max(160),
  phone: phoneSchema,
  email: emailSchema.optional().or(z.literal('')).transform((v) => v || undefined),
  destination: z.string().trim().max(160).optional(),
  travelDate: dateOnly.optional(),
  travelDateFlexible: z.boolean().default(false),
  travellersAdults: z.coerce.number().int().min(0).max(99).default(1),
  travellersChildren: z.coerce.number().int().min(0).max(99).default(0),
  travelTypeId: z.string().uuid().optional(),
  budgetAmount: z.coerce.number().nonnegative().max(100_000_000).optional(),
  budgetCurrency: z.string().length(3).default('INR'),
  leadSourceId: z.string().uuid({ message: 'Select a lead source' }),
  assignedToId: z.string().uuid().optional(),
  notes: z.string().trim().max(4000).optional(),
  /** Set true only after the user has seen and dismissed the duplicate prompt. */
  acknowledgeDuplicates: z.boolean().default(false),
  /** Attach this enquiry to a customer the user picked from the duplicate list. */
  linkToCustomerId: z.string().uuid().optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = createLeadSchema
  .partial()
  .omit({ acknowledgeDuplicates: true, linkToCustomerId: true })
  .extend({
    status: z.enum(LEAD_STATUSES).optional(),
    lostReason: z.string().trim().max(500).optional(),
  });

export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

/** Server-side filters. The lead table never filters a preloaded array (spec §8). */
export const leadListQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.union([z.enum(LEAD_STATUSES), z.array(z.enum(LEAD_STATUSES))]).optional(),
  classification: z
    .union([z.enum(LEAD_CLASSIFICATIONS), z.array(z.enum(LEAD_CLASSIFICATIONS))])
    .optional(),
  leadSourceId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  unassigned: z.coerce.boolean().optional(),
  mine: z.coerce.boolean().optional(),
  followupState: z.enum(['OVERDUE', 'TODAY', 'UPCOMING', 'NONE']).optional(),
  createdFrom: dateOnly.optional(),
  createdTo: dateOnly.optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  maxScore: z.coerce.number().int().min(0).max(100).optional(),
});

export type LeadListQuery = z.infer<typeof leadListQuerySchema>;

export const assignLeadSchema = z.object({
  assignedToId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

export const createFollowupSchema = z.object({
  leadId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  type: z.enum(FOLLOWUP_TYPES),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  dueAt: z.string().datetime({ offset: true }),
  description: z.string().trim().min(1).max(1000),
})
  .refine((v) => v.leadId || v.customerId, {
    message: 'A follow-up must be linked to a lead or a customer',
    path: ['leadId'],
  });

export type CreateFollowupInput = z.infer<typeof createFollowupSchema>;

export const completeFollowupSchema = z.object({
  outcome: z.string().trim().max(2000).optional(),
  nextFollowup: z
    .object({
      type: z.enum(FOLLOWUP_TYPES),
      dueAt: z.string().datetime({ offset: true }),
      description: z.string().trim().min(1).max(1000),
      priority: z.enum(PRIORITIES).default('MEDIUM'),
    })
    .optional(),
});

export const followupListQuerySchema = paginationSchema.extend({
  status: z.union([z.enum(FOLLOWUP_STATUSES), z.array(z.enum(FOLLOWUP_STATUSES))]).optional(),
  assignedToId: z.string().uuid().optional(),
  mine: z.coerce.boolean().optional(),
  bucket: z.enum(['OVERDUE', 'TODAY', 'UPCOMING']).optional(),
});

/** Duplicate detection result — we surface candidates, never silently merge (spec §12). */
export interface DuplicateCandidate {
  customerId: string | null;
  leadId: string | null;
  customerCode: string | null;
  name: string;
  phone: string;
  email: string | null;
  matchedOn: ('PHONE' | 'EMAIL' | 'NAME_PHONE' | 'NAME_EMAIL')[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  lastActivityAt: string | null;
}
