import type { QuotationListQuery } from '@lemuria/shared';
import { formatBps } from '@lemuria/shared';
import { AlertTriangle, FileText, Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/AppShell';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  NoResultsState,
  Pagination,
  StatusBadge,
  TableSkeleton,
  Tabs,
  type TabItem,
} from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { useDebounced } from '@/features/leads/useDebounced';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NewQuotationModal } from './NewQuotationModal';
import { useQuotations, useQuotationSummary } from './api';

type TabKey = 'ALL' | 'MINE' | 'DRAFT' | 'PENDING_APPROVAL' | 'SENT' | 'ACCEPTED';

const TAB_QUERY: Record<TabKey, Partial<QuotationListQuery>> = {
  ALL: {},
  MINE: { mine: true },
  DRAFT: { status: 'DRAFT' },
  PENDING_APPROVAL: { status: 'PENDING_APPROVAL' },
  SENT: { status: 'SENT' },
  ACCEPTED: { status: 'ACCEPTED' },
};

const TRIGGER_LABEL: Record<string, string> = {
  HIGH_VALUE: 'High value',
  LOW_MARGIN: 'Thin margin',
  LOSS_MAKING: 'Loss making',
};

export function QuotationsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [newOpen, setNewOpen] = useState(false);

  const tab = (params.get('tab') as TabKey) ?? 'ALL';
  const page = Number(params.get('page') ?? '1');
  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');
  const search = useDebounced(searchInput, 350);

  const summary = useQuotationSummary();

  const query = useMemo<Partial<QuotationListQuery>>(
    () => ({ ...TAB_QUERY[tab], page, pageSize: 25, ...(search ? { search } : {}) }),
    [tab, page, search],
  );
  const quotations = useQuotations(query);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const tabs: TabItem[] = [
    { key: 'ALL', label: 'All', count: summary.data?.total },
    { key: 'MINE', label: 'Mine' },
    { key: 'DRAFT', label: 'Draft', count: summary.data?.draft },
    { key: 'PENDING_APPROVAL', label: 'Awaiting approval', count: summary.data?.pending },
    { key: 'SENT', label: 'Sent', count: summary.data?.sent },
    { key: 'ACCEPTED', label: 'Accepted', count: summary.data?.accepted },
  ];

  return (
    <>
      <PageHeader
        title="Quotations"
        description="Priced packages, versioned, with margin visible to those who should see it."
        actions={
          can('quotation.create') ? (
            <Button leadingIcon={<Plus className="size-4" aria-hidden />} onClick={() => setNewOpen(true)}>
              New Quotation
            </Button>
          ) : null
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Kpi label="Total" value={summary.data?.total} />
          <Kpi label="Draft" value={summary.data?.draft} />
          <Kpi label="Awaiting approval" value={summary.data?.pending} tone="warn" />
          <Kpi label="Sent" value={summary.data?.sent} tone="teal" />
          <Kpi label="Accepted" value={summary.data?.accepted} tone="success" />
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <Card>
          <Tabs items={tabs} value={tab} onChange={(key) => setParam('tab', key)} className="px-3" />

          <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-3">
            <div className="min-w-52 flex-1">
              <Input
                type="search"
                placeholder="Search title, quotation ID, destination"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                leadingIcon={<Search className="size-4" aria-hidden />}
                aria-label="Search quotations"
              />
            </div>
            {searchInput && (
              <Button
                variant="ghost"
                leadingIcon={<X className="size-4" aria-hidden />}
                onClick={() => setSearchInput('')}
              >
                Clear
              </Button>
            )}
          </div>

          {quotations.isPending ? (
            <TableSkeleton rows={6} columns={6} />
          ) : quotations.isError ? (
            <ErrorState error={quotations.error} onRetry={() => void quotations.refetch()} />
          ) : quotations.data?.data.length === 0 ? (
            search ? (
              <NoResultsState onClear={() => setSearchInput('')} />
            ) : (
              <EmptyState
                title="No quotations yet"
                description="Build one from a lead, or start from a customer."
                action={
                  can('quotation.create') ? (
                    <Button size="sm" onClick={() => setNewOpen(true)}>
                      Create the first quotation
                    </Button>
                  ) : undefined
                }
              />
            )
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[56rem] border-collapse text-sm">
                  <thead>
                    <tr className="data-table-head text-left text-xs font-medium text-ink-500">
                      <th className="px-3 py-2.5 pl-5 font-medium">Quotation</th>
                      <th className="px-3 py-2.5 font-medium">Customer</th>
                      <th className="px-3 py-2.5 text-right font-medium">Value</th>
                      <th className="px-3 py-2.5 text-right font-medium">Margin</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                      <th className="px-3 py-2.5 pr-5 font-medium">Owner</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-200/70">
                    {quotations.data?.data.map((q) => (
                      <tr key={q.id} className="group transition-colors hover:bg-ink-50/70">
                        <td className="py-3 pl-5 pr-3">
                          <Link to={`/quotations/${q.id}`} className="block">
                            <p className="font-medium text-ink-900 group-hover:text-teal-700">
                              {q.title}
                            </p>
                            <p className="mt-0.5 text-xs text-ink-500">
                              <span className="font-mono text-[11px]">{q.quotationCode}</span>
                              {q.currentVersion && (
                                <>
                                  <span className="mx-1.5 text-ink-300">·</span>V
                                  {q.currentVersion.versionNumber}
                                </>
                              )}
                              {q.destination && (
                                <>
                                  <span className="mx-1.5 text-ink-300">·</span>
                                  {q.destination}
                                </>
                              )}
                            </p>
                            {q.currentVersion?.approvalTriggers?.length ? (
                              <span className="mt-1 inline-flex flex-wrap gap-1">
                                {q.currentVersion.approvalTriggers.map((t) => (
                                  <Badge key={t} tone={t === 'LOSS_MAKING' ? 'danger' : 'warm'}>
                                    <AlertTriangle className="size-3" aria-hidden />
                                    {TRIGGER_LABEL[t] ?? t}
                                  </Badge>
                                ))}
                              </span>
                            ) : null}
                          </Link>
                        </td>

                        <td className="px-3 py-3">
                          {q.customer ? (
                            <Link
                              to={`/customers/${q.customer.id}`}
                              className="text-sm text-ink-700 hover:text-teal-700"
                            >
                              {q.customer.fullName}
                            </Link>
                          ) : (
                            <span className="text-xs text-ink-400">—</span>
                          )}
                        </td>

                        <td className="tabular px-3 py-3 text-right">
                          <span className="font-medium text-ink-900">
                            {q.currentVersion ? formatMoney(q.currentVersion.totalSellingPrice) : '—'}
                          </span>
                          {q.currentVersion?.taxIsProvisional && (
                            <span
                              className="ml-1.5 text-[10px] text-warm-600"
                              title="Tax rate awaiting confirmation"
                            >
                              tax*
                            </span>
                          )}
                        </td>

                        <td className="tabular px-3 py-3 text-right">
                          {q.currentVersion?.marginBps !== null &&
                          q.currentVersion?.marginBps !== undefined ? (
                            <span
                              className={cn(
                                'font-medium',
                                q.currentVersion.marginBps <= 0
                                  ? 'text-danger-600'
                                  : q.currentVersion.marginBps < 1000
                                    ? 'text-warm-600'
                                    : 'text-success-700',
                              )}
                            >
                              {formatBps(q.currentVersion.marginBps)}
                            </span>
                          ) : (
                            <span className="text-xs text-ink-300">hidden</span>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <StatusBadge value={q.status} />
                          {q.validUntil && (
                            <p className="mt-1 text-[10px] text-ink-400">
                              valid to {formatDate(q.validUntil)}
                            </p>
                          )}
                        </td>

                        <td className="py-3 pl-3 pr-5">
                          {q.owner ? (
                            <span className="flex items-center gap-2">
                              <Avatar name={q.owner.fullName} src={q.owner.avatarUrl} size="sm" />
                              <span className="text-xs text-ink-700">{q.owner.fullName}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-ink-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {quotations.data && (
                <Pagination
                  page={quotations.data.meta.page}
                  pageSize={quotations.data.meta.pageSize}
                  total={quotations.data.meta.total}
                  onPageChange={(p) => setParam('page', String(p))}
                />
              )}
            </>
          )}
        </Card>

        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-400">
          <FileText className="size-3.5" aria-hidden />
          <span>
            <span className="text-warm-600">tax*</span> marks a quotation priced with a tax rate that
            is still awaiting confirmation.
          </span>
        </p>
      </div>

      <NewQuotationModal open={newOpen} onClose={() => setNewOpen(false)} />
    </>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value?: number;
  tone?: 'warn' | 'teal' | 'success';
}) {
  const TONE = { warn: 'text-warm-600', teal: 'text-teal-700', success: 'text-success-600' } as const;
  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2.5">
      <p className="text-[11px] font-medium text-ink-500">{label}</p>
      <p className={cn('tabular mt-0.5 text-xl font-semibold', tone ? TONE[tone] : 'text-ink-900')}>
        {value !== undefined ? formatNumber(value) : '—'}
      </p>
    </div>
  );
}
