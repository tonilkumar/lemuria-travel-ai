import { Check, Clock } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/AppShell';
import {
  Badge,
  Button,
  Card,
  ClassificationBadge,
  EmptyState,
  ErrorState,
  Pagination,
  TableSkeleton,
  Tabs,
  type TabItem,
} from '@/components/ui';
import { formatPhone, formatRelativeDay, isOverdue } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCompleteFollowup, useFollowups } from './api';
import { useFollowupBuckets } from '@/features/dashboard/api';

type Bucket = 'OVERDUE' | 'TODAY' | 'UPCOMING';

const PRIORITY_TONE = {
  URGENT: 'danger',
  HIGH: 'warm',
  MEDIUM: 'neutral',
  LOW: 'neutral',
} as const;

export function TasksPage() {
  const [params, setParams] = useSearchParams();
  const bucket = (params.get('bucket') as Bucket) ?? 'OVERDUE';
  const page = Number(params.get('page') ?? '1');

  const buckets = useFollowupBuckets();
  const completeFollowup = useCompleteFollowup();

  const query = useMemo(() => ({ bucket, page, pageSize: 25 }), [bucket, page]);
  const followups = useFollowups(query);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const tabs: TabItem[] = [
    { key: 'OVERDUE', label: 'Overdue', count: buckets.data?.overdue },
    { key: 'TODAY', label: 'Due today', count: buckets.data?.today },
    { key: 'UPCOMING', label: 'Upcoming', count: buckets.data?.upcoming },
  ];

  return (
    <>
      <PageHeader
        title="Tasks & Reminders"
        description="Your follow-up queue, oldest first."
      />

      <div className="p-4 sm:p-6">
        <Card>
          <Tabs items={tabs} value={bucket} onChange={(key) => setParam('bucket', key)} className="px-3" />

          {followups.isPending ? (
            <TableSkeleton rows={6} columns={4} />
          ) : followups.isError ? (
            <ErrorState error={followups.error} onRetry={() => void followups.refetch()} />
          ) : followups.data?.data.length ? (
            <>
              <ul className="divide-y divide-ink-200/70">
                {followups.data.data.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {f.lead ? (
                          <Link
                            to={`/leads/${f.lead.id}`}
                            className="text-sm font-medium text-ink-900 hover:text-teal-700"
                          >
                            {f.lead.customerName}
                          </Link>
                        ) : (
                          <span className="text-sm font-medium text-ink-900">Customer follow-up</span>
                        )}
                        {f.lead && <ClassificationBadge value={f.lead.classification} />}
                        <Badge tone={PRIORITY_TONE[f.priority as keyof typeof PRIORITY_TONE] ?? 'neutral'}>
                          {f.type.replace(/_/g, ' ').toLowerCase()}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-ink-600">{f.description}</p>
                      {f.lead && (
                        <p className="tabular mt-0.5 text-xs text-ink-400">
                          {formatPhone(f.lead.phone)}
                          <span className="mx-1.5 text-ink-300">·</span>
                          <span className="font-mono text-[11px]">{f.lead.leadCode}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 text-xs',
                          isOverdue(f.dueAt) ? 'font-medium text-danger-600' : 'text-ink-500',
                        )}
                      >
                        <Clock className="size-3.5" aria-hidden />
                        {formatRelativeDay(f.dueAt)}
                      </span>

                      <Button
                        size="sm"
                        variant="secondary"
                        leadingIcon={<Check className="size-4" aria-hidden />}
                        loading={completeFollowup.isPending && completeFollowup.variables?.id === f.id}
                        onClick={() => completeFollowup.mutate({ id: f.id })}
                      >
                        Done
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>

              <Pagination
                page={followups.data.meta.page}
                pageSize={followups.data.meta.pageSize}
                total={followups.data.meta.total}
                onPageChange={(p) => setParam('page', String(p))}
              />
            </>
          ) : (
            <EmptyState
              title={bucket === 'OVERDUE' ? 'Nothing overdue' : 'Nothing scheduled'}
              description="Follow-ups you schedule on a lead show up here."
            />
          )}
        </Card>
      </div>
    </>
  );
}
