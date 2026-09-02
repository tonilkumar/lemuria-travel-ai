import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  FileText,
  IndianRupee,
  Plane,
  Plus,
  TicketCheck,
  UserPlus,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FunnelChart } from '@/components/charts/FunnelChart';
import { RevenueChart } from '@/components/charts/RevenueChart';
import { PageHeader } from '@/components/layout/AppShell';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ClassificationBadge,
  EmptyState,
  ErrorState,
  Skeleton,
  StatusBadge,
} from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { formatMoneyCompact, formatNumber, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  useActiveVisaCases,
  useAtAGlance,
  useFollowupBuckets,
  useFunnel,
  useKpis,
  useLeadSources,
  useRecentEnquiries,
  useRevenueTrend,
} from './api';

/**
 * Operational dashboard.
 *
 * Every figure on this page is computed from Postgres. The numbers in the
 * design mockup were illustrative and are not reproduced anywhere here.
 */
export function DashboardPage({ onNewEnquiry }: { onNewEnquiry: () => void }) {
  const { user } = useAuth();
  const kpis = useKpis();
  const funnel = useFunnel(90);
  const sources = useLeadSources(30);
  const revenue = useRevenueTrend(30);
  const recent = useRecentEnquiries(6);
  const visa = useActiveVisaCases();
  const glance = useAtAGlance();
  const buckets = useFollowupBuckets();

  const firstName = user?.fullName.split(' ')[0] ?? '';

  return (
    <>
      <PageHeader
        title={`Good ${greeting()}, ${firstName}`}
        description="Here is what needs your attention today."
        actions={
          <Button leadingIcon={<Plus className="size-4" aria-hidden />} onClick={onNewEnquiry}>
            New Enquiry
          </Button>
        }
      />

      <div className="space-y-5 p-4 sm:p-6">
        {/* KPI row */}
        {kpis.isError ? (
          <Card>
            <ErrorState error={kpis.error} onRetry={() => void kpis.refetch()} />
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              label="New Leads Today"
              icon={<UserPlus className="size-4" aria-hidden />}
              value={kpis.data ? formatNumber(kpis.data.newLeadsToday.value) : undefined}
              changePct={kpis.data?.newLeadsToday.changePct ?? null}
              comparison="vs yesterday"
              to="/leads"
              loading={kpis.isPending}
            />
            <KpiCard
              label="Follow-ups Due"
              icon={<CalendarClock className="size-4" aria-hidden />}
              value={kpis.data ? formatNumber(kpis.data.followupsDue.value) : undefined}
              footnote={
                kpis.data && kpis.data.followupsDue.overdue > 0
                  ? `${kpis.data.followupsDue.overdue} overdue`
                  : undefined
              }
              tone={kpis.data && kpis.data.followupsDue.overdue > 0 ? 'danger' : undefined}
              to="/tasks"
              loading={kpis.isPending}
            />
            <KpiCard
              label="Quotations Today"
              icon={<FileText className="size-4" aria-hidden />}
              value={kpis.data ? formatNumber(kpis.data.quotationsToday.value) : undefined}
              changePct={kpis.data?.quotationsToday.changePct ?? null}
              comparison="vs yesterday"
              loading={kpis.isPending}
            />
            <KpiCard
              label="Active Visa Cases"
              icon={<Plane className="size-4" aria-hidden />}
              value={kpis.data ? formatNumber(kpis.data.activeVisaCases.value) : undefined}
              loading={kpis.isPending}
            />
            <KpiCard
              label="Bookings This Month"
              icon={<TicketCheck className="size-4" aria-hidden />}
              value={kpis.data ? formatNumber(kpis.data.bookingsThisMonth.value) : undefined}
              changePct={kpis.data?.bookingsThisMonth.changePct ?? null}
              comparison="vs last month"
              loading={kpis.isPending}
            />
            <KpiCard
              label="Revenue This Month"
              icon={<IndianRupee className="size-4" aria-hidden />}
              value={kpis.data ? formatMoneyCompact(kpis.data.revenueThisMonth.value) : undefined}
              changePct={kpis.data?.revenueThisMonth.changePct ?? null}
              comparison="vs last month"
              loading={kpis.isPending}
            />
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-3">
          {/* Revenue trend */}
          <Card className="xl:col-span-2">
            <CardHeader title="Revenue Trend" description="Payments received, last 30 days" />
            <CardBody className="pt-2">
              {revenue.isPending ? (
                <Skeleton className="h-[220px] w-full" />
              ) : revenue.isError ? (
                <ErrorState error={revenue.error} onRetry={() => void revenue.refetch()} />
              ) : revenue.data && revenue.data.some((p) => p.amount > 0) ? (
                <RevenueChart data={revenue.data} />
              ) : (
                <EmptyState
                  title="No payments recorded yet"
                  description="Revenue appears here once payments are recorded against bookings."
                />
              )}
            </CardBody>
          </Card>

          {/* Sales funnel */}
          <Card>
            <CardHeader
              title="Sales Funnel"
              description="Last 90 days"
              action={
                funnel.data ? (
                  <Badge tone="teal">{funnel.data.overallConversionPct}% overall</Badge>
                ) : null
              }
            />
            <CardBody>
              {funnel.isPending ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : funnel.isError ? (
                <ErrorState error={funnel.error} onRetry={() => void funnel.refetch()} />
              ) : funnel.data && funnel.data.stages[0]?.count ? (
                <FunnelChart stages={funnel.data.stages} />
              ) : (
                <EmptyState title="No leads in this window" />
              )}
            </CardBody>
          </Card>
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          {/* Recent enquiries */}
          <Card className="xl:col-span-2">
            <CardHeader
              title="Recent Enquiries"
              action={
                <Link
                  to="/leads"
                  className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
                >
                  View all <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            {recent.isPending ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : recent.isError ? (
              <ErrorState error={recent.error} onRetry={() => void recent.refetch()} />
            ) : recent.data?.length ? (
              <ul className="divide-y divide-ink-200/70">
                {recent.data.map((lead) => (
                  <li key={lead.id}>
                    <Link
                      to={`/leads/${lead.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-ink-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-ink-900">
                            {lead.customerName}
                          </p>
                          <ClassificationBadge value={lead.classification} />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-ink-500">
                          {lead.destination ?? 'Destination not set'}
                          {lead.sourceName && <span className="mx-1.5 text-ink-300">·</span>}
                          {lead.sourceName}
                        </p>
                      </div>
                      <div className="hidden text-right sm:block">
                        <StatusBadge value={lead.status} />
                        <p className="mt-1 text-[11px] text-ink-400">{timeAgo(lead.createdAt)}</p>
                      </div>
                      {lead.assignedToName && (
                        <Avatar name={lead.assignedToName} src={lead.assignedToAvatar} size="sm" />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No enquiries yet"
                description="New enquiries will appear here as your team files them."
                action={
                  <Button size="sm" onClick={onNewEnquiry}>
                    Create the first enquiry
                  </Button>
                }
              />
            )}
          </Card>

          <div className="space-y-5">
            {/* Tasks & reminders */}
            <Card>
              <CardHeader title="Tasks & Reminders" />
              <CardBody className="space-y-2">
                {buckets.isPending ? (
                  <Skeleton className="h-24 w-full" />
                ) : (
                  <>
                    <BucketRow
                      label="Overdue"
                      count={buckets.data?.overdue ?? 0}
                      tone="danger"
                      to="/tasks?bucket=OVERDUE"
                    />
                    <BucketRow
                      label="Due today"
                      count={buckets.data?.today ?? 0}
                      tone="warm"
                      to="/tasks?bucket=TODAY"
                    />
                    <BucketRow
                      label="Upcoming"
                      count={buckets.data?.upcoming ?? 0}
                      tone="neutral"
                      to="/tasks?bucket=UPCOMING"
                    />
                  </>
                )}
              </CardBody>
            </Card>

            {/* Lead sources */}
            <Card>
              <CardHeader title="Lead Sources" description="Last 30 days" />
              <CardBody>
                {sources.isPending ? (
                  <Skeleton className="h-28 w-full" />
                ) : sources.data?.length ? (
                  <ul className="space-y-2.5">
                    {sources.data.slice(0, 6).map((s) => (
                      <li key={s.id}>
                        <div className="mb-1 flex items-baseline justify-between text-xs">
                          <span className="font-medium text-ink-700">{s.name}</span>
                          <span className="tabular text-ink-500">
                            {formatNumber(s.total)}
                            <span className="ml-1.5 text-ink-400">{s.sharePct}%</span>
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${s.sharePct}%`,
                              backgroundColor: s.colour ?? 'var(--color-teal-500)',
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No leads in this window" className="py-6" />
                )}
              </CardBody>
            </Card>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          {/* Active visa cases */}
          <Card className="xl:col-span-2">
            <CardHeader title="Active Visa Cases" />
            {visa.isPending ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : visa.data?.length ? (
              <ul className="divide-y divide-ink-200/70">
                {visa.data.map((c) => (
                  <li key={c.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900">{c.customerName}</p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {c.countryName}
                        <span className="mx-1.5 text-ink-300">·</span>
                        <span className="font-mono text-[11px]">{c.caseCode}</span>
                      </p>
                    </div>
                    <div className="w-32 shrink-0">
                      <div className="mb-1 flex justify-between text-[10px] text-ink-500">
                        <span className="truncate">{stepLabel(c.currentStep)}</span>
                        <span className="tabular">{c.progressPct}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                        <div
                          className="h-full rounded-full bg-teal-500"
                          style={{ width: `${c.progressPct}%` }}
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No active visa cases" />
            )}
          </Card>

          {/* At a glance */}
          <Card>
            <CardHeader title="At a Glance" />
            <CardBody>
              {glance.isPending ? (
                <Skeleton className="h-32 w-full" />
              ) : glance.data ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
                  <Stat label="Total customers" value={glance.data.totalCustomers} />
                  <Stat label="Active" value={glance.data.activeCustomers} />
                  <Stat label="Repeat" value={glance.data.repeatCustomers} />
                  <Stat
                    label="Follow-ups done"
                    value={glance.data.followupsCompletedThisMonth}
                    hint="this month"
                  />
                  <Stat
                    label="Passports expiring"
                    value={glance.data.passportsExpiring}
                    hint="within 6 months"
                    alert={glance.data.passportsExpiring > 0}
                  />
                  <Stat
                    label="Visas expiring"
                    value={glance.data.visasExpiring}
                    hint="within 3 months"
                    alert={glance.data.visasExpiring > 0}
                  />
                </dl>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function stepLabel(step: string): string {
  return step.charAt(0) + step.slice(1).toLowerCase().replace(/_/g, ' ');
}

function KpiCard({
  label,
  value,
  icon,
  changePct,
  comparison,
  footnote,
  tone,
  to,
  loading,
}: {
  label: string;
  value?: string;
  icon: ReactNode;
  changePct?: number | null;
  comparison?: string;
  footnote?: string;
  tone?: 'danger';
  to?: string;
  loading?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-500">{label}</span>
        <span className="text-ink-400">{icon}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-16" />
      ) : (
        <p className="tabular mt-1.5 text-2xl font-semibold text-ink-900">{value ?? '—'}</p>
      )}
      {!loading && footnote && (
        <p className={cn('mt-1 text-xs', tone === 'danger' ? 'text-danger-600' : 'text-ink-500')}>
          {footnote}
        </p>
      )}
      {!loading && changePct !== undefined && changePct !== null && (
        <p className="mt-1 flex items-center gap-1 text-xs">
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-medium',
              changePct >= 0 ? 'text-success-600' : 'text-danger-600',
            )}
          >
            {changePct >= 0 ? (
              <ArrowUpRight className="size-3" aria-hidden />
            ) : (
              <ArrowDownRight className="size-3" aria-hidden />
            )}
            {Math.abs(changePct)}%
          </span>
          {comparison && <span className="text-ink-400">{comparison}</span>}
        </p>
      )}
    </>
  );

  const className =
    'card p-4 transition-shadow' + (to ? ' hover:shadow-raised focus-visible:shadow-raised' : '');

  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function BucketRow({
  label,
  count,
  tone,
  to,
}: {
  label: string;
  count: number;
  tone: 'danger' | 'warm' | 'neutral';
  to: string;
}) {
  const TONE = {
    danger: 'text-danger-600 bg-danger-50',
    warm: 'text-warm-700 bg-warm-50',
    neutral: 'text-ink-600 bg-ink-100',
  } as const;

  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-lg px-2 py-1.5 transition-colors hover:bg-ink-50"
    >
      <span className="text-sm text-ink-700">{label}</span>
      <span className={cn('tabular rounded-md px-2 py-0.5 text-sm font-semibold', TONE[tone])}>
        {count}
      </span>
    </Link>
  );
}

function Stat({
  label,
  value,
  hint,
  alert,
}: {
  label: string;
  value: number;
  hint?: string;
  alert?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd
        className={cn(
          'tabular mt-0.5 text-lg font-semibold',
          alert ? 'text-warm-600' : 'text-ink-900',
        )}
      >
        {formatNumber(value)}
      </dd>
      {hint && <p className="text-[10px] text-ink-400">{hint}</p>}
    </div>
  );
}
