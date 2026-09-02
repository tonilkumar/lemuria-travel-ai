import type {
  CreateFollowupInput,
  CreateLeadInput,
  DuplicateCandidate,
  LeadListQuery,
} from '@lemuria/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface LeadRow {
  id: string;
  leadCode: string;
  customerId: string | null;
  customerName: string;
  phone: string;
  email: string | null;
  destination: string | null;
  travelDate: string | null;
  travellersAdults: number;
  travellersChildren: number;
  budgetAmount: number | null;
  status: string;
  score: number;
  classification: string;
  scoreReason: string | null;
  nextFollowupAt: string | null;
  lastContactAt: string | null;
  lastContactChannel: string | null;
  createdAt: string;
  source: { id: string; name: string; colour: string | null } | null;
  assignedTo: {
    id: string;
    fullName: string;
    designation: string | null;
    avatarUrl: string | null;
  } | null;
}

export interface LeadSummary {
  total: number;
  hot: number;
  warm: number;
  cold: number;
  converted: number;
  lost: number;
  overdueFollowups: number;
  unassigned: number;
}

export interface MasterDataOption {
  id: string;
  key?: string;
  name: string;
  colour?: string | null;
}

export interface AssignableUser {
  id: string;
  fullName: string;
  designation: string | null;
  avatarUrl: string | null;
  roles: string[];
}

/** Query params are passed straight through, so filtering happens server-side. */
export const useLeads = (query: Partial<LeadListQuery>) =>
  useQuery({
    queryKey: ['leads', 'list', query],
    queryFn: () => api.list<LeadRow>('/leads', query as Record<string, unknown>),
    placeholderData: (previous) => previous,
  });

export const useLeadSummary = (query: Partial<LeadListQuery>) =>
  useQuery({
    queryKey: ['leads', 'summary', query],
    queryFn: () => api.get<LeadSummary>('/leads/summary', query as Record<string, unknown>),
    placeholderData: (previous) => previous,
  });

export const useLead = (id: string | undefined) =>
  useQuery({
    queryKey: ['leads', 'detail', id],
    queryFn: () => api.get<Record<string, unknown>>(`/leads/${id}`),
    enabled: Boolean(id),
  });

export const useLeadTimeline = (id: string | undefined) =>
  useQuery({
    queryKey: ['leads', 'timeline', id],
    queryFn: () => api.get<Record<string, unknown>[]>(`/leads/${id}/timeline`),
    enabled: Boolean(id),
  });

export const useLeadSourceOptions = () =>
  useQuery({
    queryKey: ['master-data', 'lead-sources'],
    queryFn: () => api.get<MasterDataOption[]>('/master-data/lead-sources'),
    staleTime: 10 * 60_000,
  });

export const useTravelTypeOptions = () =>
  useQuery({
    queryKey: ['master-data', 'travel-types'],
    queryFn: () => api.get<MasterDataOption[]>('/master-data/travel-types'),
    staleTime: 10 * 60_000,
  });

export const useAssignableUsers = () =>
  useQuery({
    queryKey: ['users', 'assignable'],
    queryFn: () => api.get<AssignableUser[]>('/users/assignable'),
    staleTime: 5 * 60_000,
  });

export function useCheckDuplicates() {
  return useMutation({
    mutationFn: (input: { customerName: string; phone: string; email?: string }) =>
      api.post<DuplicateCandidate[]>('/leads/check-duplicates', input),
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLeadInput) => api.post<LeadRow>('/leads', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useAssignLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, assignedToId, reason }: { id: string; assignedToId: string; reason?: string }) =>
      api.post(`/leads/${id}/assign`, { assignedToId, reason }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.patch(`/leads/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useAddNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => api.post(`/leads/${id}/notes`, { body }),
    onSuccess: (_d, vars) => void qc.invalidateQueries({ queryKey: ['leads', 'timeline', vars.id] }),
  });
}

export interface FollowupRow {
  id: string;
  type: string;
  status: string;
  priority: string;
  dueAt: string;
  description: string;
  completedAt: string | null;
  outcome: string | null;
  lead: {
    id: string;
    leadCode: string;
    customerName: string;
    phone: string;
    classification: string;
  } | null;
  assignedTo: { id: string; fullName: string; avatarUrl: string | null } | null;
}

export const useFollowups = (query: Record<string, unknown>) =>
  useQuery({
    queryKey: ['followups', 'list', query],
    queryFn: () => api.list<FollowupRow>('/followups', query),
    placeholderData: (previous) => previous,
  });

export function useCreateFollowup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFollowupInput) => api.post('/followups', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['followups'] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useCompleteFollowup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, outcome }: { id: string; outcome?: string }) =>
      api.post(`/followups/${id}/complete`, { outcome }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['followups'] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
