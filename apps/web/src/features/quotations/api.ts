import type {
  CreateQuotationInput,
  GenerateQuotationContentInput,
  QuotationListQuery,
  UpdateVersionContentInput,
  UpsertPackageInput,
} from '@lemuria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface QuotationRow {
  id: string;
  quotationCode: string;
  title: string;
  destination: string | null;
  status: string;
  travelStartDate: string | null;
  validUntil: string | null;
  createdAt: string;
  customer: { id: string; fullName: string; customerCode: string } | null;
  owner: { id: string; fullName: string; avatarUrl: string | null } | null;
  currentVersion: {
    id: string;
    versionNumber: number;
    totalSellingPrice: number;
    marginBps: number | null;
    marginAmount: number | null;
    approvalTriggers: string[] | null;
    taxIsProvisional: boolean;
  } | null;
}

export interface QuotationPackage {
  id: string;
  versionId: string;
  name: string;
  description: string | null;
  isRecommended: boolean;
  sortOrder: number;
  supplierCost: number | null;
  otherCost: number | null;
  baseCost: number | null;
  markupBps: number | null;
  markupOverride: number | null;
  markupAmount: number | null;
  discountBps: number;
  discountOverride: number | null;
  discountAmount: number;
  discountReason: string | null;
  netBeforeTax: number;
  gstBps: number;
  taxBasis: string;
  taxableValue: number;
  gstAmount: number;
  taxIsProvisional: boolean;
  sellingPrice: number;
  marginAmount: number | null;
  marginBps: number | null;
  travellerCount: number;
  perPersonPrice: number | null;
}

export interface QuotationItem {
  id: string;
  packageId: string;
  category: string;
  description: string;
  quantity: number;
  unitCost: number | null;
  totalCost: number | null;
  dayNumber: number | null;
  sortOrder: number;
}

export interface QuotationVersion {
  id: string;
  versionNumber: number;
  status: string;
  introText: string | null;
  inclusions: string[] | null;
  exclusions: string[] | null;
  termsText: string | null;
  totalSupplierCost: number | null;
  totalMarkup: number | null;
  totalDiscount: number;
  totalNetBeforeTax: number;
  totalGst: number;
  totalSellingPrice: number;
  marginAmount: number | null;
  marginBps: number | null;
  approvalTriggers: string[] | null;
  taxIsProvisional: boolean;
  sentAt: string | null;
}

export interface QuotationDetail {
  quotation: {
    id: string;
    quotationCode: string;
    title: string;
    destination: string | null;
    travelStartDate: string | null;
    travelEndDate: string | null;
    travellersAdults: number;
    travellersChildren: number;
    validUntil: string | null;
    status: string;
    currentVersionId: string | null;
    createdAt: string;
  };
  customer: {
    id: string;
    customerCode: string;
    fullName: string;
    primaryPhone: string;
    email: string | null;
    tier: string;
  } | null;
  lead: { id: string; leadCode: string } | null;
  owner: { id: string; fullName: string; avatarUrl: string | null } | null;
  versions: QuotationVersion[];
  currentVersion: QuotationVersion | null;
  packages: QuotationPackage[];
  items: QuotationItem[];
  approvals: {
    id: string;
    decision: string;
    triggerReason: string | null;
    comments: string | null;
    decidedAt: string | null;
    createdAt: string;
    requestedBy: string | null;
  }[];
  canSeeMargin: boolean;
}

export interface TaxRateOption {
  id: string;
  serviceCategory: string;
  name: string;
  rateBps: number;
  basis: string;
  inputCreditAllowed: boolean;
  isProvisional: boolean;
  authorityNote: string | null;
}

export const useQuotations = (query: Partial<QuotationListQuery>) =>
  useQuery({
    queryKey: ['quotations', 'list', query],
    queryFn: () => api.list<QuotationRow>('/quotations', query as Record<string, unknown>),
    placeholderData: (previous) => previous,
  });

export const useQuotationSummary = () =>
  useQuery({
    queryKey: ['quotations', 'summary'],
    queryFn: () =>
      api.get<{
        total: number;
        draft: number;
        pending: number;
        sent: number;
        accepted: number;
        declined: number;
      }>('/quotations/summary'),
  });

export const useQuotation = (id: string | undefined) =>
  useQuery({
    queryKey: ['quotations', 'detail', id],
    queryFn: () => api.get<QuotationDetail>(`/quotations/${id}`),
    enabled: Boolean(id),
  });

export const useTaxRates = () =>
  useQuery({
    queryKey: ['quotations', 'tax-rates'],
    queryFn: () => api.get<TaxRateOption[]>('/quotations/tax-rates'),
    staleTime: 10 * 60_000,
  });

export function useCreateQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQuotationInput) => api.post<{ id: string }>('/quotations', input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['quotations'] }),
  });
}

export function useCreateVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (quotationId: string) =>
      api.post<QuotationVersion>(`/quotations/${quotationId}/versions`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['quotations'] }),
  });
}

export function useUpsertPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId, ...body }: { versionId: string } & UpsertPackageInput) =>
      api.put<{ packageId: string }>(`/quotations/versions/${versionId}/packages`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['quotations'] }),
  });
}

export function useDeletePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId, packageId }: { versionId: string; packageId: string }) =>
      api.delete(`/quotations/versions/${versionId}/packages/${packageId}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['quotations'] }),
  });
}

export function useUpdateContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId, ...body }: { versionId: string } & UpdateVersionContentInput) =>
      api.patch(`/quotations/versions/${versionId}/content`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['quotations'] }),
  });
}

export interface SubmitResult {
  status: string;
  triggers: string[];
  needsApproval: boolean;
}

export function useSubmitForApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) =>
      api.post<SubmitResult>(`/quotations/versions/${versionId}/submit`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['quotations'] }),
  });
}

export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      versionId,
      decision,
      comments,
    }: {
      versionId: string;
      decision: 'APPROVED' | 'REJECTED';
      comments?: string;
    }) => api.post(`/quotations/versions/${versionId}/decision`, { decision, comments }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['quotations'] }),
  });
}

export function useSendQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId, channel }: { versionId: string; channel: string }) =>
      api.post(`/quotations/versions/${versionId}/send`, { channel }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['quotations'] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useRecordOutcome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      versionId,
      outcome,
      reason,
    }: {
      versionId: string;
      outcome: 'ACCEPTED' | 'DECLINED';
      reason?: string;
    }) => api.post(`/quotations/versions/${versionId}/outcome`, { outcome, reason }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['quotations'] }),
  });
}

export interface AiDraft {
  generationId: string;
  kind: string;
  text: string;
  items: string[] | null;
  status: string;
  provider: string;
  model: string;
  latencyMs: number;
}

export function useGenerateDraft() {
  return useMutation({
    mutationFn: ({
      versionId,
      ...body
    }: { versionId: string } & GenerateQuotationContentInput) =>
      api.post<AiDraft>(`/quotations/versions/${versionId}/ai/draft`, body),
  });
}

export function useReviewDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      generationId,
      decision,
      editedText,
      reason,
    }: {
      generationId: string;
      decision: 'APPROVE' | 'REJECT';
      editedText?: string;
      reason?: string;
    }) =>
      api.post(`/quotations/ai/drafts/${generationId}/review`, { decision, editedText, reason }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['quotations'] }),
  });
}

/**
 * Opens the quotation PDF.
 *
 * Fetched as a blob rather than linked: the access token lives in memory, so a
 * plain href would 401.
 */
export async function openQuotationPdf(versionId: string): Promise<void> {
  const { blob } = await api.download(`/quotations/versions/${versionId}/pdf`);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
