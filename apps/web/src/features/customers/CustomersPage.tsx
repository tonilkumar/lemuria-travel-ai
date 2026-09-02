import type { CustomerListQuery } from '@lemuria/shared';
import { AlertTriangle, MessageCircle, Phone, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/AppShell';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ErrorState,
  Input,
  NoResultsState,
  Pagination,
  Select,
  Tabs,
  TableSkeleton,
  type TabItem,
} from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { useAssignableUsers } from '@/features/leads/api';
import { useDebounced } from '@/features/leads/useDebounced';
import { formatDate, formatNumber, formatPhone, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCustomers, useCustomerSummary } from './api';
import { CustomerFormModal } from './CustomerFormModal';
import { TierBadge } from './TierBadge';

type TabKey = 'ALL' | 'MINE' | 'REPEAT' | 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE';

const TAB_QUERY: Record<TabKey, Partial<CustomerListQuery>> = {
  ALL: {},
  MINE: { mine: true },
  REPEAT: { repeatOnly: true },
  PLATINUM: { tier: 'PLATINUM' },
  GOLD: { tier: 'GOLD' },
  SILVER: { tier: 'SILVER' },
  BRONZE: { tier: 'BRONZE' },
};

export function CustomersPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [formOpen, setFormOpen] = useState(false);

  const tab = (params.get('tab') as TabKey) ?? 'ALL';
  const page = Number(params.get('page') ?? '1');
  const pageSize = Number(params.get('pageSize') ?? '25');

  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');
  const search = useDebounced(searchInput, 350);
  const [showFilters, setShowFilters] = useState(false);

  const ownerId = params.get('ownerId') ?? '';
  const passportExpiring = params.get('passportExpiringInDays') ?? '';

  const assignees = useAssignableUsers();

  const query = useMemo<Partial<CustomerListQuery>>(
    () => ({
      ...TAB_QUERY[tab],
      page,
      pageSize,
      ...(search ? { search } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(passportExpiring ? { passportExpiringInDays: Number(passportExpiring) } : {}),
    }),
    [tab, page, pageSize, search, ownerId, passportExpiring],
  );

  const customers = useCustomers(query);
  const summary = useCustomerSummary(query);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const clearFilters = () => {
    setSearchInput('');
    setParams(new URLSearchParams({ tab }), { replace: true });
  };

  const activeFilterCount = [ownerId, passportExpiring].filter(Boolean).length;

  const tabs: TabItem[] = [
    { key: 'ALL', label: 'All Customers', count: summary.data?.total },
    { key: 'MINE', label: 'My Customers' },
    { key: 'REPEAT', label: 'Repeat', count: summary.data?.repeat },
    { key: 'PLATINUM', label: 'Platinum', count: summary.data?.platinum },
    { key: 'GOLD', label: 'Gold', count: summary.data?.gold },
    { key: 'SILVER', label: 'Silver', count: summary.data?.silver },
    { key: 'BRONZE', label: 'Bronze', count: summary.data?.bronze },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone Lemuria has travelled with, and everyone about to."
        actions={
          can('customer.create') ? (
            <Button leadingIcon={<Plus className="size-4" aria-hidden />} onClick={() => setFormOpen(true)}>
              New Customer
            </Button>
          ) : null
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Kpi label="Total" value={summary.data?.total} />
          <Kpi label="Active" value={summary.data?.active} tone="success" />
          <Kpi label="Repeat" value={summary.data?.repeat} tone="teal" />
          <Kpi label="Platinum" value={summary.data?.platinum} tone="platinum" />
          <Kpi label="Gold" value={summary.data?.gold} tone="gold" />
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <Card>
          <Tabs items={tabs} value={tab} onChange={(key) => setParam('tab', key)} className="px-3" />

          <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-3">
            <div className="min-w-52 flex-1">
              <Input
                type="search"
                placeholder="Search name, phone, customer ID, city"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                leadingIcon={<Search className="size-4" aria-hidden />}
                aria-label="Search customers"
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
              <Button variant="ghost" leadingIcon={<X className="size-4" aria-hidden />} onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>

          {showFilters && (
            <div className="grid gap-3 border-b border-ink-200 bg-ink-50/50 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
              <Select
                label="Relationship owner"
                placeholder="Anyone"
                value={ownerId}
                onChange={(e) => setParam('ownerId', e.target.value)}
                options={(assignees.data ?? []).map((u) => ({ value: u.id, label: u.fullName }))}
              />
              <Select
                label="Passport expiring"
                placeholder="Any"
                value={passportExpiring}
                onChange={(e) => setParam('passportExpiringInDays', e.target.value)}
                options={[
                  { value: '30', label: 'Within 1 month' },
                  { value: '90', label: 'Within 3 months' },
                  { value: '180', label: 'Within 6 months' },
                  { value: '365', label: 'Within 12 months' },
                ]}
              />
            </div>
          )}

          {customers.isPending ? (
            <TableSkeleton rows={8} columns={6} />
          ) : customers.isError ? (
            <ErrorState error={customers.error} onRetry={() => void customers.refetch()} />
          ) : customers.data && customers.data.data.length === 0 ? (
            <NoResultsState onClear={clearFilters} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[56rem] border-collapse text-sm">
                  <thead>
                    <tr className="data-table-head text-left text-xs font-medium text-ink-500">
                      <th className="px-3 py-2.5 pl-5 font-medium">Customer</th>
                      <th className="px-3 py-2.5 font-medium">Tier</th>
                      <th className="px-3 py-2.5 font-medium">Bookings</th>
                      <th className="px-3 py-2.5 font-medium">Passport</th>
                      <th className="px-3 py-2.5 font-medium">Owner</th>
                      <th className="px-3 py-2.5 font-medium">Last activity</th>
                      <th className="px-3 py-2.5 pr-5 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-200/70">
                    {customers.data?.data.map((customer) => (
                      <tr key={customer.id} className="group transition-colors hover:bg-ink-50/70">
                        <td className="py-3 pl-5 pr-3">
                          <Link to={`/customers/${customer.id}`} className="block">
                            <p className="font-medium text-ink-900 group-hover:text-teal-700">
                              {customer.fullName}
                            </p>
                            <p className="tabular mt-0.5 text-xs text-ink-500">
                              {formatPhone(customer.primaryPhone)}
                              <span className="mx-1.5 text-ink-300">·</span>
                              <span className="font-mono text-[11px]">{customer.customerCode}</span>
                            </p>
                            {customer.city && (
                              <p className="mt-0.5 text-xs text-ink-400">{customer.city}</p>
                            )}
                          </Link>
                        </td>

                        <td className="px-3 py-3">
                          <TierBadge tier={customer.tier} score={customer.relationshipScore} />
                        </td>

                        <td className="tabular px-3 py-3 text-ink-700">
                          {customer.totalBookings}
                          {customer.totalBookings > 1 && (
                            <span className="ml-1.5 text-[10px] text-teal-600">repeat</span>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <PassportCell expiresOn={customer.passportExpiresOn} />
                        </td>

                        <td className="px-3 py-3">
                          {customer.owner ? (
                            <span className="flex items-center gap-2">
                              <Avatar name={customer.owner.fullName} src={customer.owner.avatarUrl} size="sm" />
                              <span className="text-xs text-ink-700">{customer.owner.fullName}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-ink-400">—</span>
                          )}
                        </td>

                        <td className="px-3 py-3 text-xs text-ink-500">
                          {customer.lastActivityAt ? timeAgo(customer.lastActivityAt) : '—'}
                        </td>

                        <td className="py-3 pl-3 pr-5">
                          <div className="flex items-center justify-end gap-1">
                            <a
                              href={`tel:${customer.primaryPhone}`}
                              aria-label={`Call ${customer.fullName}`}
                              className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-teal-50 hover:text-teal-700"
                            >
                              <Phone className="size-4" aria-hidden />
                            </a>
                            <a
                              href={`https://wa.me/91${customer.primaryPhone}`}
                              target="_blank"
                              rel="noreferrer noopener"
                              aria-label={`WhatsApp ${customer.fullName}`}
                              className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-success-50 hover:text-success-700"
                            >
                              <MessageCircle className="size-4" aria-hidden />
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {customers.data && (
                <Pagination
                  page={customers.data.meta.page}
                  pageSize={customers.data.meta.pageSize}
                  total={customers.data.meta.total}
                  onPageChange={(p) => setParam('page', String(p))}
                  onPageSizeChange={(s) => setParam('pageSize', String(s))}
                />
              )}
            </>
          )}
        </Card>
      </div>

      <CustomerFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </>
  );
}

/** Passport expiry is shown in the list because it is the most common reason to call someone. */
function PassportCell({ expiresOn }: { expiresOn: string | null }) {
  if (!expiresOn) return <span className="text-xs text-ink-400">Not on file</span>;

  const days = Math.round((new Date(expiresOn).getTime() - Date.now()) / 86_400_000);

  if (days < 0) {
    return (
      <Badge tone="danger">
        <AlertTriangle className="size-3" aria-hidden />
        Expired
      </Badge>
    );
  }
  if (days <= 180) {
    return (
      <Badge tone={days <= 90 ? 'hot' : 'warm'}>
        <AlertTriangle className="size-3" aria-hidden />
        {days <= 30 ? `${days}d left` : formatDate(expiresOn)}
      </Badge>
    );
  }
  return <span className="text-xs text-ink-600">{formatDate(expiresOn)}</span>;
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value?: number;
  tone?: 'success' | 'teal' | 'platinum' | 'gold';
}) {
  const TONE = {
    success: 'text-success-600',
    teal: 'text-teal-700',
    platinum: 'text-ink-800',
    gold: 'text-warm-600',
  } as const;

  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2.5">
      <p className="text-[11px] font-medium text-ink-500">{label}</p>
      <p className={cn('tabular mt-0.5 text-xl font-semibold', tone ? TONE[tone] : 'text-ink-900')}>
        {value !== undefined ? formatNumber(value) : '—'}
      </p>
    </div>
  );
}
