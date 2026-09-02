import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { api } from '@/lib/api';
import { toDateParam } from '@/lib/format';

export interface KpiValue {
  value: number;
  previous: number;
  changePct: number | null;
}

export interface DashboardKpis {
  newLeadsToday: KpiValue;
  followupsDue: { value: number; overdue: number };
  quotationsToday: KpiValue;
  activeVisaCases: { value: number };
  bookingsThisMonth: KpiValue;
  revenueThisMonth: KpiValue;
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  conversionPct: number;
}

export interface FunnelResponse {
  stages: FunnelStage[];
  overallConversionPct: number;
  windowDays: number;
}

export interface SourceSlice {
  id: string;
  name: string;
  colour: string | null;
  total: number;
  converted: number;
  sharePct: number;
}

export interface RevenuePoint {
  date: string;
  amount: number;
}

export interface RecentEnquiry {
  id: string;
  leadCode: string;
  customerName: string;
  destination: string | null;
  status: string;
  classification: string;
  createdAt: string;
  sourceName: string | null;
  sourceColour: string | null;
  assignedToName: string | null;
  assignedToAvatar: string | null;
}

export interface ActiveVisaCase {
  id: string;
  caseCode: string;
  currentStep: string;
  travelDate: string | null;
  customerName: string;
  countryName: string;
  progressPct: number;
}

export interface AtAGlance {
  totalCustomers: number;
  activeCustomers: number;
  repeatCustomers: number;
  passportsExpiring: number;
  visasExpiring: number;
  followupsCompletedThisMonth: number;
}

export const useKpis = () =>
  useQuery({ queryKey: ['dashboard', 'kpis'], queryFn: () => api.get<DashboardKpis>('/dashboard/kpis') });

export const useFunnel = (days = 90) =>
  useQuery({
    queryKey: ['dashboard', 'funnel', days],
    queryFn: () => api.get<FunnelResponse>('/dashboard/funnel', { days }),
  });

export const useLeadSources = (days = 30) =>
  useQuery({
    queryKey: ['dashboard', 'sources', days],
    queryFn: () => api.get<SourceSlice[]>('/dashboard/lead-sources', { days }),
  });

export const useRevenueTrend = (days = 30) =>
  useQuery({
    queryKey: ['dashboard', 'revenue', days],
    queryFn: () =>
      api.get<RevenuePoint[]>('/dashboard/revenue-trend', {
        from: toDateParam(subDays(new Date(), days - 1)),
        to: toDateParam(new Date()),
      }),
  });

export const useRecentEnquiries = (limit = 8) =>
  useQuery({
    queryKey: ['dashboard', 'recent', limit],
    queryFn: () => api.get<RecentEnquiry[]>('/dashboard/recent-enquiries', { limit }),
  });

export const useActiveVisaCases = () =>
  useQuery({
    queryKey: ['dashboard', 'visa'],
    queryFn: () => api.get<ActiveVisaCase[]>('/dashboard/visa-cases'),
  });

export const useAtAGlance = () =>
  useQuery({ queryKey: ['dashboard', 'glance'], queryFn: () => api.get<AtAGlance>('/dashboard/at-a-glance') });

export const useFollowupBuckets = () =>
  useQuery({
    queryKey: ['followups', 'buckets'],
    queryFn: () => api.get<{ overdue: number; today: number; upcoming: number }>('/followups/buckets'),
  });
