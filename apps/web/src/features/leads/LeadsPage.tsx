import type { LeadListQuery } from '@lemuria/shared';
import {
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/AppShell';
import {
  Avatar,
  Button,
  Card,
  ClassificationBadge,
  ErrorState,
  Input,
  NoResultsState,
  Pagination,
  Select,
  StatusBadge,
  Tabs,
  TableSkeleton,
  type TabItem,
} from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { formatDate, formatPhone, formatRelativeDay, isOverdue, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAssignableUsers, useLeadSourceOptions, useLeads, useLeadSummary } from './api';
import { useDebounced } from './useDebounced';

type TabKey = 'ALL' | 'MINE' | 'UNASSIGNED' | 'HOT' | 'WARM' | 'COLD' | 'CONVERTED' | 'LOST';

/** Each tab is a preset over the same server-side query, not a client filter. */
const TAB_QUERY: Record<TabKey, Partial<LeadListQuery>> = {
  ALL: {},
  MINE: { mine: true },
  UNASSIGNED: { unassigned: true },
  HOT: { classification: 'HOT' },
  WARM: { classification: 'WARM' },
  COLD: { classification: 'COLD' },
  CONVERTED: { status: 'CONVERTED' },
  LOST: { status: 'LOST' },
};

export function LeadsPage({ onNewEnquiry }: { onNewEnquiry: () => void }) {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();

  const tab = (params.get('tab') as TabKey) ?? 'ALL';
  const page = Number(params.get('page') ?? '1');
  const pageSize = Number(params.get('pageSize') ?? '25');

  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');
  const search = useDebounced(searchInput, 350);
  const [showFilters, setShowFilters] = useState(false);

  const sourceId = params.get('leadSourceId') ?? '';
  const assignedToId = params.get('assignedToId') ?? '';
  const followupState = params.get('followupState') ?? '';
  const createdFrom = params.get('createdFrom') ?? '';
  const createdTo = params.get('createdTo') ?? '';

  const sources = useLeadSourceOptions();
  const assignees = useAssignableUsers();

  const query = useMemo<Partial<LeadListQuery>>(
    () => ({
      ...TAB_QUERY[tab],
      page,
      pageSize,
      ...(search ? { search } : {}),
      ...(sourceId ? { leadSourceId: sourceId } : {}),
      ...(assignedToId ? { assignedToId } : {}),
      ...(followupState ? { followupState: followupState as 'OVERDUE' } : {}),
      ...(createdFrom ? { createdFrom } : {}),
      ...(createdTo ? { createdTo } : {}),
    }),
    [tab, page, pageSize, search, sourceId, assignedToId, followupState, createdFrom, createdTo],
  );

  const leads = useLeads(query);
  const summary = useLeadSummary(query);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // Any filter change resets to the first page.
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const clearFilters = () => {
    setSearchInput('');
    setParams(new URLSearchParams({ tab }), { replace: true });
  };

  const activeFilterCount = [sourceId, assignedToId, followupState, createdFrom, createdTo].filter(
    Boolean,
  ).length;

  const tabs: TabItem[] = [
    { key: 'ALL', label: 'All Leads', count: summary.data?.total },
    { key: 'MINE', label: 'My Leads' },
    { key: 'UNASSIGNED', label: 'Unassigned', count: summary.data?.unassigned },
    { key: 'HOT', label: 'Hot', count: summary.data?.hot },
    { key: 'WARM', label: 'Warm', count: summary.data?.warm },
    { key: 'COLD', label: 'Cold', count: summary.data?.cold },
    { key: 'CONVERTED', label: 'Converted', count: summary.data?.converted },
    { key: 'LOST', label: 'Lost', count: summary.data?.lost },
  ];

  return (
    <>
      <PageHeader
        title="Leads & Follow-ups"
        description="Every enquiry, who owns it, and what happens next."
        actions={
          can('lead.create') ? (
            <Button leadingIcon={<Plus className="size-4" aria-hidden />} onClick={onNewEnquiry}>
              New Enquiry
            </Button>
          ) : null
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Total Leads" value={summary.data?.total} loading={summary.isPending} />
          <Kpi label="Hot" value={summary.data?.hot} tone="hot" loading={summary.isPending} />
          <Kpi label="Warm" value={summary.data?.warm} tone="warm" loading={summary.isPending} />
          <Kpi label="Cold" value={summary.data?.cold} tone="cold" loading={summary.isPending} />
          <Kpi
            label="Overdue Follow-ups"
            value={summary.data?.overdueFollowups}
            tone="danger"
            loading={summary.isPending}
          />
          <Kpi
            label="Converted"
            value={summary.data?.converted}
            tone="success"
            loading={summary.isPending}
          />
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <Card>
          <Tabs items={tabs} value={tab} onChange={(key) => setParam('tab', key)} className="px-3" />

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-3">
            <div className="min-w-52 flex-1">
              <Input
                type="search"
                placeholder="Search name, phone, lead ID, destination"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                leadingIcon={<Search className="size-4" aria-hidden />}
                aria-label="Search leads"
              />
            </div>

            <Button
              variant={showFilters || activeFilterCount ? 'subtle' : 'secondary'}
              leadingIcon={<SlidersHorizontal className="size-4" aria-hidden />}
              onClick={() => setShowFilters((v) => !v)}
            >
              Filters
              {activeFilterCount > 0 && (
                <span className="tabular ml-1 rounded-full bg-teal-600 px-1.5 text-[10px] text-white">
                  {activeFilterCount}
                </span>
              )}
            </Button>

            {(activeFilterCount > 0 || searchInput) && (
              <Button
                variant="ghost"
                leadingIcon={<X className="size-4" aria-hidden />}
                onClick={clearFilters}
              >
                Clear
              </Button>
            )}
          </div>

          {showFilters && (
            <div className="grid gap-3 border-b border-ink-200 bg-ink-50/50 px-4 py-4 sm:grid-cols-2 lg:grid-cols-5">
              <Select
                label="Lead source"
                placeholder="Any source"
                value={sourceId}
                onChange={(e) => setParam('leadSourceId', e.target.value)}
                options={(sources.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
              />
              <Select
                label="Executive"
                placeholder="Anyone"
                value={assignedToId}
                onChange={(e) => setParam('assignedToId', e.target.value)}
                options={(assignees.data ?? []).map((u) => ({ value: u.id, label: u.fullName }))}
              />
              <Select
                label="Follow-up"
                placeholder="Any"
                value={followupState}
                onChange={(e) => setParam('followupState', e.target.value)}
                options={[
                  { value: 'OVERDUE', label: 'Overdue' },
                  { value: 'TODAY', label: 'Due today' },
                  { value: 'UPCOMING', label: 'Upcoming' },
                  { value: 'NONE', label: 'None scheduled' },
                ]}
              />
              <Input
                label="Created from"
                type="date"
                value={createdFrom}
                onChange={(e) => setParam('createdFrom', e.target.value)}
              />
              <Input
                label="Created to"
                type="date"
                value={createdTo}
                onChange={(e) => setParam('createdTo', e.target.value)}
              />
            </div>
          )}

          {/* Table */}
          {leads.isPending ? (
            <TableSkeleton rows={8} columns={7} />
          ) : leads.isError ? (
            <ErrorState error={leads.error} onRetry={() => void leads.refetch()} />
          ) : leads.data && leads.data.data.length === 0 ? (
            <NoResultsState onClear={clearFilters} />
          ) : (
            <>
              {/* Horizontal scroll keeps every column readable on a tablet
                  instead of crushing them (spec §37). */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[64rem] border-collapse text-sm">
                  <thead>
                    <tr className="data-table-head text-left text-xs font-medium text-ink-500">
                      <Th className="pl-5">Lead Details</Th>
                      <Th>Score</Th>
                      <Th>Source</Th>
                      <Th>Executive</Th>
                      <Th>Next Follow-up</Th>
                      <Th>Last Contact</Th>
                      <Th>Status</Th>
                      <Th className="pr-5 text-right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-200/70">
                    {leads.data?.data.map((lead) => (
                      <tr key={lead.id} className="group transition-colors hover:bg-ink-50/70">
                        <td className="py-3 pl-5 pr-3">
                          <Link to={`/leads/${lead.id}`} className="block">
                            <p className="font-medium text-ink-900 group-hover:text-teal-700">
                              {lead.customerName}
                            </p>
                            <p className="tabular mt-0.5 text-xs text-ink-500">
                              {formatPhone(lead.phone)}
                              <span className="mx-1.5 text-ink-300">·</span>
                              <span className="font-mono text-[11px]">{lead.leadCode}</span>
                            </p>
                            {lead.destination && (
                              <p className="mt-0.5 truncate text-xs text-ink-400">
                                {lead.destination}
                                {lead.travelDate && ` · ${formatDate(lead.travelDate)}`}
                              </p>
                            )}
                          </Link>
                        </td>

                        <td className="px-3 py-3">
                          <ClassificationBadge value={lead.classification} score={lead.score} />
                        </td>

                        <td className="px-3 py-3">
                          {lead.source ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-ink-600">
                              <span
                                className="size-2 rounded-full"
                                style={{
                                  backgroundColor: lead.source.colour ?? 'var(--color-ink-400)',
                                }}
                                aria-hidden
                              />
                              {lead.source.name}
                            </span>
                          ) : (
                            <span className="text-xs text-ink-400">—</span>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          {lead.assignedTo ? (
                            <span className="flex items-center gap-2">
                              <Avatar
                                name={lead.assignedTo.fullName}
                                src={lead.assignedTo.avatarUrl}
                                size="sm"
                              />
                              <span className="leading-tight">
                                <span className="block text-xs font-medium text-ink-800">
                                  {lead.assignedTo.fullName}
                                </span>
                                {lead.assignedTo.designation && (
                                  <span className="block text-[10px] text-ink-500">
                                    {lead.assignedTo.designation}
                                  </span>
                                )}
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-warm-600">Unassigned</span>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          {lead.nextFollowupAt ? (
                            <span
                              className={cn(
                                'text-xs',
                                isOverdue(lead.nextFollowupAt)
                                  ? 'font-medium text-danger-600'
                                  : 'text-ink-600',
                              )}
                            >
                              {formatRelativeDay(lead.nextFollowupAt)}
                              {isOverdue(lead.nextFollowupAt) && (
                                <span className="mt-0.5 block text-[10px]">Overdue</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-xs text-ink-400">Not scheduled</span>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          {lead.lastContactAt ? (
                            <span className="text-xs text-ink-600">
                              {timeAgo(lead.lastContactAt)}
                              {lead.lastContactChannel && (
                                <span className="mt-0.5 block text-[10px] text-ink-400">
                                  {lead.lastContactChannel.toLowerCase()}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-xs text-ink-400">No contact yet</span>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <StatusBadge value={lead.status} />
                        </td>

                        <td className="py-3 pl-3 pr-5">
                          <div className="flex items-center justify-end gap-1">
                            <a
                              href={`tel:${lead.phone}`}
                              aria-label={`Call ${lead.customerName}`}
                              className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-teal-50 hover:text-teal-700"
                            >
                              <Phone className="size-4" aria-hidden />
                            </a>
                            <a
                              href={`https://wa.me/91${lead.phone}`}
                              target="_blank"
                              rel="noreferrer noopener"
                              aria-label={`WhatsApp ${lead.customerName}`}
                              className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-success-50 hover:text-success-700"
                            >
                              <MessageCircle className="size-4" aria-hidden />
                            </a>
                            <Link
                              to={`/leads/${lead.id}`}
                              aria-label={`Open ${lead.customerName}`}
                              className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
                            >
                              <MoreHorizontal className="size-4" aria-hidden />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {leads.data && (
                <Pagination
                  page={leads.data.meta.page}
                  pageSize={leads.data.meta.pageSize}
                  total={leads.data.meta.total}
                  onPageChange={(p) => setParam('page', String(p))}
                  onPageSizeChange={(s) => setParam('pageSize', String(s))}
                />
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn('px-3 py-2.5 font-medium', className)}>{children}</th>;
}

function Kpi({
  label,
  value,
  tone,
  loading,
}: {
  label: string;
  value?: number;
  tone?: 'hot' | 'warm' | 'cold' | 'danger' | 'success';
  loading?: boolean;
}) {
  const TONE = {
    hot: 'text-hot-600',
    warm: 'text-warm-600',
    cold: 'text-cold-600',
    danger: 'text-danger-600',
    success: 'text-success-600',
  } as const;

  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2.5">
      <p className="text-[11px] font-medium text-ink-500">{label}</p>
      <p
        className={cn(
          'tabular mt-0.5 text-xl font-semibold',
          tone ? TONE[tone] : 'text-ink-900',
          loading && 'opacity-40',
        )}
      >
        {value ?? '—'}
      </p>
    </div>
  );
}
