import type {
  ConvertLeadInput,
  CreateCustomerInput,
  CustomerListQuery,
  CustomerPreferencesInput,
  DuplicateCandidate,
  PassportInput,
  UpdateCustomerInput,
} from '@lemuria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface CustomerRow {
  id: string;
  customerCode: string;
  fullName: string;
  primaryPhone: string;
  email: string | null;
  city: string | null;
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  relationshipScore: number;
  totalBookings: number;
  lastActivityAt: string | null;
  isActive: boolean;
  createdAt: string;
  owner: { id: string; fullName: string; avatarUrl: string | null } | null;
  passportExpiresOn: string | null;
}

export interface CustomerSummary {
  total: number;
  active: number;
  repeat: number;
  platinum: number;
  gold: number;
  silver: number;
  bronze: number;
}

export interface PassportRecord {
  id: string;
  passportNumberMasked: string;
  fullNameOnPassport: string | null;
  nationality: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  placeOfIssue: string | null;
  isPrimary: boolean;
  documentId: string | null;
  daysToExpiry: number | null;
}

export interface DocumentRecord {
  id: string;
  documentCode: string;
  type: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  expiresOn: string | null;
  referenceNumberMasked?: string | null;
  verifiedAt: string | null;
  createdAt: string;
  daysToExpiry: number | null;
}

export interface CustomerProfile {
  customer: {
    id: string;
    customerCode: string;
    fullName: string;
    salutation: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    nationality: string | null;
    primaryPhone: string;
    alternatePhone: string | null;
    email: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
    relationshipScore: number;
    totalBookings: number;
    firstBookingAt: string | null;
    lastBookingAt: string | null;
    lastActivityAt: string | null;
    isActive: boolean;
    notes: string | null;
    createdAt: string;
  };
  owner: { id: string; fullName: string; email: string; avatarUrl: string | null } | null;
  preferences: {
    mealPreference: string | null;
    seatPreference: string | null;
    hotelCategory: string | null;
    roomPreference: string | null;
    interests: string[] | null;
    dietaryRestrictions: string | null;
    accessibilityNeeds: string | null;
    preferredLanguage: string | null;
    notes: string | null;
  } | null;
  passports: PassportRecord[];
  leads: {
    id: string;
    leadCode: string;
    destination: string | null;
    travelDate: string | null;
    status: string;
    classification: string;
    score: number;
    createdAt: string;
  }[];
  bookings: {
    id: string;
    bookingCode: string;
    status: string;
    travelStartDate: string | null;
    travelEndDate: string | null;
    totalAmount: number;
    amountReceived: number;
    amountOutstanding: number;
    confirmedAt: string | null;
  }[];
  finance: {
    lifetimeValue: number;
    paymentCount: number;
    lastPaidOn: string | null;
    outstanding: number;
  };
  documents: DocumentRecord[];
  visaCases: {
    id: string;
    caseCode: string;
    currentStep: string;
    travelDate: string | null;
    decision: string | null;
    visaValidTo: string | null;
    countryName: string | null;
  }[];
  group: {
    groupId: string;
    groupName: string;
    memberId: string;
    memberName: string;
    memberCode: string;
    relationship: string | null;
  }[];
  /** True when sensitive documents were withheld from this caller. */
  documentsRestricted: boolean;
}

export const useCustomers = (query: Partial<CustomerListQuery>) =>
  useQuery({
    queryKey: ['customers', 'list', query],
    queryFn: () => api.list<CustomerRow>('/customers', query as Record<string, unknown>),
    placeholderData: (previous) => previous,
  });

export const useCustomerSummary = (query: Partial<CustomerListQuery>) =>
  useQuery({
    queryKey: ['customers', 'summary', query],
    queryFn: () => api.get<CustomerSummary>('/customers/summary', query as Record<string, unknown>),
    placeholderData: (previous) => previous,
  });

export const useCustomer = (id: string | undefined) =>
  useQuery({
    queryKey: ['customers', 'detail', id],
    queryFn: () => api.get<CustomerProfile>(`/customers/${id}`),
    enabled: Boolean(id),
  });

export interface TimelineEntry {
  kind: 'LEAD' | 'BOOKING' | 'PAYMENT' | 'DOCUMENT' | 'FOLLOWUP' | 'NOTE';
  at: string;
  [key: string]: unknown;
}

export const useCustomerTimeline = (id: string | undefined) =>
  useQuery({
    queryKey: ['customers', 'timeline', id],
    queryFn: () => api.get<TimelineEntry[]>(`/customers/${id}/timeline`),
    enabled: Boolean(id),
  });

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomerInput) => api.post<CustomerRow>('/customers', input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdateCustomerInput) =>
      api.patch(`/customers/${id}`, body),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['customers', 'detail', vars.id] });
      void qc.invalidateQueries({ queryKey: ['customers', 'list'] });
    },
  });
}

export function useSavePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & CustomerPreferencesInput) =>
      api.put(`/customers/${id}/preferences`, body),
    onSuccess: (_d, vars) => void qc.invalidateQueries({ queryKey: ['customers', 'detail', vars.id] }),
  });
}

export function useAddPassport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & PassportInput) =>
      api.post(`/customers/${id}/passports`, body),
    onSuccess: (_d, vars) => void qc.invalidateQueries({ queryKey: ['customers', 'detail', vars.id] }),
  });
}

export function useAddCustomerNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      api.post(`/customers/${id}/notes`, { body }),
    onSuccess: (_d, vars) =>
      void qc.invalidateQueries({ queryKey: ['customers', 'timeline', vars.id] }),
  });
}

export function useCheckCustomerDuplicates() {
  return useMutation({
    mutationFn: (input: { fullName: string; phone: string; email?: string }) =>
      api.post<DuplicateCandidate[]>('/customers/check-duplicates', input),
  });
}

export interface ConversionResult {
  customerId: string;
  customerCode: string;
  createdCustomer: boolean;
  leadCode: string;
}

export function useConvertLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, ...body }: { leadId: string } & ConvertLeadInput) =>
      api.post<ConversionResult>(`/leads/${leadId}/convert`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['customers'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
