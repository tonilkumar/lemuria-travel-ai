import {
  EXPIRY_THRESHOLDS,
  expirySeverity,
  type DocumentType,
  type ExpirySeverity,
} from '@lemuria/shared';
import { AlertTriangle, MessageCircle, Phone, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/AppShell';
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Pagination,
  Select,
  Tabs,
  type BadgeTone,
  type TabItem,
} from '@/components/ui';
import { useDebounced } from '@/features/leads/useDebounced';
import { formatDate, formatNumber, formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDocuments, useExpiringDocuments } from './api';

const SEVERITY_TONE: Record<ExpirySeverity, BadgeTone> = {
  CRITICAL: 'danger',
  URGENT: 'hot',
  WARN: 'warm',
  INFO: 'neutral',
};

const SEVERITY_ORDER: ExpirySeverity[] = ['CRITICAL', 'URGENT', 'WARN', 'INFO'];

const SEVERITY_HEADING: Record<ExpirySeverity, string> = {
  CRITICAL: 'Expired or within a month',
  URGENT: 'Within 3 months',
  WARN: 'Within 6 months',
  INFO: 'Within 12 months',
};

const SEVERITY_NOTE: Record<ExpirySeverity, string> = {
  CRITICAL: 'These block travel now. Contact the customer today.',
  URGENT: 'Most embassies refuse a passport with under six months of validity.',
  WARN: 'Renewal takes weeks. Flag these before the next booking.',
  INFO: 'Worth mentioning at the next conversation.',
};

type TabKey = 'EXPIRY' | 'ALL';

/**
 * The expiry queue.
 *
 * Grouped by urgency rather than sorted by date, because the action differs per
 * band: a passport inside three months blocks a visa application outright,
 * while one inside a year is just worth mentioning (spec §16).
 */
export function DocumentExpiryPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabKey) ?? 'EXPIRY';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const expiring = useExpiringDocuments(365);

  const grouped = useMemo(() => {
    const buckets: Record<ExpirySeverity, typeof expiring.data> = {
      CRITICAL: [],
      URGENT: [],
      WARN: [],
      INFO: [],
    };
    for (const doc of expiring.data ?? []) {
      const severity = expirySeverity(doc.daysToExpiry);
      if (severity) buckets[severity]?.push(doc);
    }
    return buckets;
  }, [expiring.data]);

  const totalExpiring = expiring.data?.length ?? 0;

  const tabs: TabItem[] = [
    { key: 'EXPIRY', label: 'Expiry queue', count: totalExpiring },
    { key: 'ALL', label: 'All documents' },
  ];

  return (
    <>
      <PageHeader
        title="Documents"
        description="Expiring paperwork, and everything on file."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SEVERITY_ORDER.map((severity) => (
            <div key={severity} className="rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2.5">
              <p className="text-[11px] font-medium text-ink-500">
                {EXPIRY_THRESHOLDS.find((t) => t.severity === severity)?.label ?? severity}
              </p>
              <p
                className={cn(
                  'tabular mt-0.5 text-xl font-semibold',
                  severity === 'CRITICAL'
                    ? 'text-danger-600'
                    : severity === 'URGENT'
                      ? 'text-hot-600'
                      : severity === 'WARN'
                        ? 'text-warm-600'
                        : 'text-ink-900',
                )}
              >
                {formatNumber(grouped[severity]?.length ?? 0)}
              </p>
            </div>
          ))}
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <Card>
          <Tabs items={tabs} value={tab} onChange={(key) => setParam('tab', key)} className="px-3" />

          {tab === 'EXPIRY' ? (
            expiring.isPending ? (
              <LoadingState label="Loading expiry queue" />
            ) : expiring.isError ? (
              <ErrorState error={expiring.error} onRetry={() => void expiring.refetch()} />
            ) : totalExpiring === 0 ? (
              <EmptyState
                title="Nothing expiring in the next year"
                description="Passports and visas approaching their date will appear here."
              />
            ) : (
              <div className="divide-y divide-ink-200">
                {SEVERITY_ORDER.map((severity) => {
                  const rows = grouped[severity] ?? [];
                  if (rows.length === 0) return null;

                  return (
                    <section key={severity}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2 bg-ink-50/70 px-5 py-2.5">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-800">
                          <AlertTriangle
                            className={cn(
                              'size-4',
                              severity === 'CRITICAL' ? 'text-danger-500' : 'text-warm-500',
                            )}
                            aria-hidden
                          />
                          {SEVERITY_HEADING[severity]}
                          <Badge tone={SEVERITY_TONE[severity]}>{rows.length}</Badge>
                        </h3>
                        <p className="text-xs text-ink-500">{SEVERITY_NOTE[severity]}</p>
                      </div>

                      <ul className="divide-y divide-ink-200/70">
                        {rows.map((doc) => (
                          <li key={doc.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                            <div className="min-w-0 flex-1">
                              <Link
                                to={`/customers/${doc.customerId}`}
                                className="text-sm font-medium text-ink-900 hover:text-teal-700"
                              >
                                {doc.customerName}
                              </Link>
                              <p className="tabular mt-0.5 text-xs text-ink-500">
                                {doc.title}
                                <span className="mx-1.5 text-ink-300">·</span>
                                {formatPhone(doc.customerPhone)}
                                <span className="mx-1.5 text-ink-300">·</span>
                                <span className="font-mono text-[11px]">{doc.customerCode}</span>
                              </p>
                            </div>

                            <div className="text-right">
                              <p
                                className={cn(
                                  'text-xs font-medium',
                                  doc.daysToExpiry < 0 ? 'text-danger-600' : 'text-ink-700',
                                )}
                              >
                                {doc.daysToExpiry < 0
                                  ? `Expired ${Math.abs(doc.daysToExpiry)}d ago`
                                  : `${doc.daysToExpiry}d left`}
                              </p>
                              <p className="text-[11px] text-ink-400">{formatDate(doc.expiresOn)}</p>
                            </div>

                            <div className="flex items-center gap-1">
                              <a
                                href={`tel:${doc.customerPhone}`}
                                aria-label={`Call ${doc.customerName}`}
                                className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-teal-50 hover:text-teal-700"
                              >
                                <Phone className="size-4" aria-hidden />
                              </a>
                              <a
                                href={`https://wa.me/91${doc.customerPhone}`}
                                target="_blank"
                                rel="noreferrer noopener"
                                aria-label={`WhatsApp ${doc.customerName}`}
                                className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-success-50 hover:text-success-700"
                              >
                                <MessageCircle className="size-4" aria-hidden />
                              </a>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )
          ) : (
            <AllDocumentsTab />
          )}
        </Card>
      </div>
    </>
  );
}

function AllDocumentsTab() {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput, 350);
  const [type, setType] = useState<DocumentType | ''>('');
  const [page, setPage] = useState(1);

  const documents = useDocuments(
    useMemo(
      () => ({
        page,
        pageSize: 25,
        ...(search ? { search } : {}),
        ...(type ? { type } : {}),
      }),
      [page, search, type],
    ),
  );

  return (
    <>
      <CardHeader
        title="All documents"
        description="Sensitive documents are hidden unless your role includes them"
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-3">
        <div className="min-w-52 flex-1">
          <Input
            type="search"
            placeholder="Search title, filename, document ID"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
            leadingIcon={<Search className="size-4" aria-hidden />}
            aria-label="Search documents"
          />
        </div>
        <Select
          placeholder="All types"
          value={type}
          onChange={(e) => {
            setType(e.target.value as DocumentType | '');
            setPage(1);
          }}
          aria-label="Document type"
          options={[
            { value: 'PASSPORT', label: 'Passport' },
            { value: 'VISA', label: 'Visa' },
            { value: 'IDENTITY_PROOF', label: 'Identity proof' },
            { value: 'TICKET', label: 'Ticket' },
            { value: 'INVOICE', label: 'Invoice' },
            { value: 'RECEIPT', label: 'Receipt' },
            { value: 'OTHER', label: 'Other' },
          ]}
          className="w-44"
        />
      </div>

      {documents.isPending ? (
        <LoadingState />
      ) : documents.isError ? (
        <ErrorState error={documents.error} onRetry={() => void documents.refetch()} />
      ) : documents.data?.data.length === 0 ? (
        <EmptyState title="No documents match" />
      ) : (
        <>
          <ul className="divide-y divide-ink-200/70">
            {documents.data?.data.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{doc.title}</p>
                  <p className="truncate text-xs text-ink-500">
                    {doc.fileName}
                    <span className="mx-1.5 text-ink-300">·</span>
                    <span className="font-mono text-[11px]">{doc.documentCode}</span>
                  </p>
                </div>
                <Badge tone="neutral">{doc.type.replace(/_/g, ' ').toLowerCase()}</Badge>
                {doc.expiresOn && (
                  <span className="text-xs text-ink-500">{formatDate(doc.expiresOn)}</span>
                )}
              </li>
            ))}
          </ul>

          {documents.data && (
            <Pagination
              page={documents.data.meta.page}
              pageSize={documents.data.meta.pageSize}
              total={documents.data.meta.total}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </>
  );
}
