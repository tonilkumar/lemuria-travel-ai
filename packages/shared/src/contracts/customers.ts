import { z } from 'zod';
import { CUSTOMER_TIERS } from '../domain/enums.js';
import { dateOnly, emailSchema, paginationSchema, phoneSchema } from './api.js';

export const createCustomerSchema = z.object({
  fullName: z.string().trim().min(2, 'Name is required').max(160),
  salutation: z.string().trim().max(12).optional(),
  primaryPhone: phoneSchema,
  alternatePhone: phoneSchema.optional(),
  email: emailSchema.optional().or(z.literal('')).transform((v) => v || undefined),
  dateOfBirth: dateOnly.optional(),
  gender: z.string().trim().max(20).optional(),
  nationality: z.string().trim().max(60).default('Indian'),

  addressLine1: z.string().trim().max(300).optional(),
  addressLine2: z.string().trim().max(300).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().max(16).optional(),
  country: z.string().trim().max(80).default('India'),

  ownerId: z.string().uuid().optional(),
  notes: z.string().trim().max(4000).optional(),

  /** Set true once the user has seen and dismissed the duplicate candidates. */
  acknowledgeDuplicates: z.boolean().default(false),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema
  .partial()
  .omit({ acknowledgeDuplicates: true })
  .extend({
    isActive: z.boolean().optional(),
    /** Tier is normally derived from booking history; this is a manual override. */
    tier: z.enum(CUSTOMER_TIERS).optional(),
  });

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const customerListQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  tier: z.union([z.enum(CUSTOMER_TIERS), z.array(z.enum(CUSTOMER_TIERS))]).optional(),
  ownerId: z.string().uuid().optional(),
  mine: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
  /** Only customers with more than one confirmed booking. */
  repeatOnly: z.coerce.boolean().optional(),
  /** Customers holding a passport that expires within N days. */
  passportExpiringInDays: z.coerce.number().int().min(1).max(1095).optional(),
  createdFrom: dateOnly.optional(),
  createdTo: dateOnly.optional(),
});

export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

export const customerPreferencesSchema = z.object({
  mealPreference: z.string().trim().max(40).optional(),
  seatPreference: z.string().trim().max(40).optional(),
  hotelCategory: z.string().trim().max(40).optional(),
  roomPreference: z.string().trim().max(40).optional(),
  interests: z.array(z.string().trim().max(60)).max(20).default([]),
  dietaryRestrictions: z.string().trim().max(500).optional(),
  accessibilityNeeds: z.string().trim().max(500).optional(),
  preferredLanguage: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type CustomerPreferencesInput = z.infer<typeof customerPreferencesSchema>;

/**
 * Converting a lead to a customer.
 *
 * Either attach the lead to an existing customer (`customerId`) or create a new
 * one from the lead's own details. The lead itself is never deleted or
 * rewritten — it keeps its history and gains a customer link (spec §10).
 */
export const convertLeadSchema = z.object({
  /** Attach to this existing customer. Omit to create one from the lead. */
  customerId: z.string().uuid().optional(),
  /** Field overrides applied when creating a new customer from the lead. */
  customer: createCustomerSchema.partial().optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type ConvertLeadInput = z.infer<typeof convertLeadSchema>;

export const passportSchema = z.object({
  passportNumber: z
    .string()
    .trim()
    .min(6, 'Enter the full passport number')
    .max(20)
    .regex(/^[A-Za-z0-9]+$/, 'Letters and numbers only'),
  fullNameOnPassport: z.string().trim().max(200).optional(),
  nationality: z.string().trim().max(60).default('Indian'),
  issuedOn: dateOnly.optional(),
  expiresOn: dateOnly,
  placeOfIssue: z.string().trim().max(120).optional(),
  isPrimary: z.boolean().default(true),
});

export type PassportInput = z.infer<typeof passportSchema>;

export const linkGroupMemberSchema = z.object({
  customerId: z.string().uuid(),
  relationship: z.string().trim().max(60).optional(),
});

export const createGroupSchema = z.object({
  name: z.string().trim().min(2).max(160),
  primaryCustomerId: z.string().uuid(),
  members: z.array(linkGroupMemberSchema).max(20).default([]),
});
