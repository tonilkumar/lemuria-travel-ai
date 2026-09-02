import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  IndianRupee,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plane,
  StickyNote,
  Users,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
  LoadingState,
  StatusBadge,
  Tabs,
  Textarea,
  type TabItem,
} from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { DocumentsPanel } from '@/features/documents/DocumentsPanel';
import { formatDate, formatMoney, formatPhone, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAddCustomerNote, useCustomer, useCustomerTimeline, useUnlinkGroupMember } from './api';
import { CustomerFormModal } from './CustomerFormModal';
import { LinkFamilyModal } from './LinkFamilyModal';
import { PassportsPanel } from './PassportsPanel';
import { PreferencesModal } from './PreferencesModal';
import { TierBadge } from './TierBadge';

type TabKey = 'OVERVIEW' | 'DOCUMENTS' | 'HISTORY' | 'TIMELINE';

const ACTION_LINK =
  'inline-flex h-9 items-center gap-2 rounded-lg border border-ink-300 bg-white px-3.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50';

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const profile = useCustomer(id);
  const [tab, setTab] = useState<TabKey>('OVERVIEW');
  const [editOpen, setEditOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  if (profile.isPending) return <LoadingState label="Loading customer" />;
  if (profile.isError) {
    return <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />;
  }

  const data = profile.data;
  if (!data) return <ErrorState error={new Error('No profile returned')} />;

  const { customer } = data;

  const tabs: TabItem[] = [
    { key: 'OVERVIEW', label: 'Overview' },
    { key: 'DOCUMENTS', label: 'Documents', count: data.documents.length },
    { key: 'HISTORY', label: 'Travel history', count: data.bookings.length },
    { key: 'TIMELINE', label: 'Activity' },
  ];

  return (
    <>
      <div className="border-b border-ink-200 bg-white px-4 py-5 sm:px-6">
        <Link
          to="/customers"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-teal-700"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to customers
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3.5">
            <Avatar name={customer.fullName} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-lg font-semibold text-ink-900">
                  {customer.salutation ? `${customer.salutation} ` : ''}
                  {customer.fullName}
                </h1>
                <TierBadge tier={customer.tier} score={customer.relationshipScore} />
                {!customer.isActive && <Badge tone="neutral">Inactive</Badge>}
                {customer.totalBookings > 1 && <Badge tone="teal">Repeat customer</Badge>}
              </div>
              <p className="tabular mt-1 text-sm text-ink-500">
                {formatPhone(customer.primaryPhone)}
                {customer.email && (
                  <>
                    <span className="mx-1.5 text-ink-300">·</span>
                    {customer.email}
                  </>
                )}
                <span className="mx-1.5 text-ink-300">·</span>
                <span className="font-mono text-xs">{customer.customerCode}</span>
              </p>
              {(customer.city || customer.state) && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-400">
                  <MapPin className="size-3" aria-hidden />
                  {[customer.city, customer.state, customer.country].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a href={`tel:${customer.primaryPhone}`} className={ACTION_LINK}>
              <Phone className="size-4" aria-hidden />
              Call
            </a>
            <a
              href={`https://wa.me/91${customer.primaryPhone}`}
              target="_blank"
              rel="noreferrer noopener"
              className={ACTION_LINK}
            >
              <MessageCircle className="size-4" aria-hidden />
              WhatsApp
            </a>
            {customer.email && (
              <a href={`mailto:${customer.email}`} className={ACTION_LINK}>
                <Mail className="size-4" aria-hidden />
                Email
              </a>
            )}
            {can('customer.update') && (
              <Button
                variant="secondary"
                leadingIcon={<Pencil className="size-4" aria-hidden />}
                onClick={() => setEditOpen(true)}
              >
                Edit
              </Button>
            )}
          </div>
        </div>

        {/* Relationship at a glance */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            icon={<BookOpen className="size-4" aria-hidden />}
            label="Bookings"
            value={String(customer.totalBookings)}
          />
          <Stat
            icon={<IndianRupee className="size-4" aria-hidden />}
            label="Lifetime value"
            value={formatMoney(data.finance.lifetimeValue)}
          />
          <Stat
            icon={<IndianRupee className="size-4" aria-hidden />}
            label="Outstanding"
            value={formatMoney(data.finance.outstanding)}
            tone={data.finance.outstanding > 0 ? 'warn' : undefined}
          />
          <Stat
            icon={<CalendarDays className="size-4" aria-hidden />}
            label="Last travelled"
            value={customer.lastBookingAt ? formatDate(customer.lastBookingAt) : 'Never'}
          />
        </div>

        <Tabs
          items={tabs}
          value={tab}
          onChange={(key) => setTab(key as TabKey)}
          className="-mb-5 mt-5"
        />
      </div>

      <div className="p-4 sm:p-6">
        {tab === 'OVERVIEW' && (
          <OverviewTab
            data={data}
            onEditPreferences={() => setPrefsOpen(true)}
            onLinkFamily={() => setLinkOpen(true)}
          />
        )}

        {tab === 'DOCUMENTS' && (
          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <DocumentsPanel
                customerId={customer.id}
                documents={data.documents}
                restricted={data.documentsRestricted}
              />
            </Card>
            <Card>
              <PassportsPanel customerId={customer.id} passports={data.passports} />
            </Card>
          </div>
        )}

        {tab === 'HISTORY' && <HistoryTab data={data} />}
        {tab === 'TIMELINE' && <TimelineTab customerId={customer.id} />}
      </div>

      <CustomerFormModal open={editOpen} onClose={() => setEditOpen(false)} existing={customer} />
      <LinkFamilyModal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        customerId={customer.id}
        customerName={customer.fullName}
        excludeIds={data.group.map((m) => m.memberId)}
      />
      <PreferencesModal
        open={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        customerId={customer.id}
        existing={data.preferences}
      />
    </>
  );
}

function OverviewTab({
  data,
  onEditPreferences,
  onLinkFamily,
}: {
  data: NonNullable<ReturnType<typeof useCustomer>['data']>;
  onEditPreferences: () => void;
  onLinkFamily: () => void;
}) {
  const unlink = useUnlinkGroupMember();
  const { customer, preferences } = data;

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <div className="space-y-5 xl:col-span-2">
        <Card>
          <CardHeader title="Personal details" />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Detail label="Date of birth" value={customer.dateOfBirth ? formatDate(customer.dateOfBirth) : '—'} />
              <Detail label="Gender" value={customer.gender ?? '—'} />
              <Detail label="Nationality" value={customer.nationality ?? '—'} />
              <Detail label="Alternate phone" value={formatPhone(customer.alternatePhone)} />
              <Detail label="Customer since" value={formatDate(customer.createdAt)} />
              <Detail label="Relationship owner" value={data.owner?.fullName ?? 'Unassigned'} />
            </dl>

            {(customer.addressLine1 || customer.city) && (
              <div className="mt-5 border-t border-ink-200 pt-4">
                <p className="text-xs text-ink-500">Address</p>
                <p className="mt-1 text-sm text-ink-800">
                  {[
                    customer.addressLine1,
                    customer.addressLine2,
                    customer.city,
                    customer.state,
                    customer.postalCode,
                    customer.country,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              </div>
            )}

            {customer.notes && (
              <div className="mt-4 rounded-lg bg-ink-50 p-3">
                <p className="text-xs font-medium text-ink-500">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{customer.notes}</p>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Enquiries" description="Every enquiry this customer has raised" />
          {data.leads.length === 0 ? (
            <EmptyState title="No enquiries linked" />
          ) : (
            <ul className="divide-y divide-ink-200/70">
              {data.leads.map((lead) => (
                <li key={lead.id}>
                  <Link
                    to={`/leads/${lead.id}`}
                    className="flex flex-wrap items-center gap-3 px-5 py-3 transition-colors hover:bg-ink-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900">
                        {lead.destination ?? 'Destination not set'}
                      </p>
                      <p className="tabular mt-0.5 text-xs text-ink-500">
                        <span className="font-mono text-[11px]">{lead.leadCode}</span>
                        {lead.travelDate && (
                          <>
                            <span className="mx-1.5 text-ink-300">·</span>
                            {formatDate(lead.travelDate)}
                          </>
                        )}
                      </p>
                    </div>
                    <ClassificationBadge value={lead.classification} score={lead.score} />
                    <StatusBadge value={lead.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Visa cases" />
          {data.visaCases.length === 0 ? (
            <EmptyState title="No visa cases" className="py-8" />
          ) : (
            <ul className="divide-y divide-ink-200/70">
              {data.visaCases.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <Plane className="size-4 shrink-0 text-ink-400" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-900">{c.countryName ?? 'Unknown country'}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      <span className="font-mono text-[11px]">{c.caseCode}</span>
                      {c.travelDate && (
                        <>
                          <span className="mx-1.5 text-ink-300">·</span>
                          Travel {formatDate(c.travelDate)}
                        </>
                      )}
                    </p>
                  </div>
                  <Badge tone={c.decision === 'APPROVED' ? 'success' : 'neutral'}>
                    {c.currentStep.charAt(0) + c.currentStep.slice(1).toLowerCase().replace(/_/g, ' ')}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Travel preferences"
            action={
              <Button variant="ghost" size="sm" onClick={onEditPreferences}>
                {preferences ? 'Edit' : 'Add'}
              </Button>
            }
          />
          <CardBody>
            {preferences ? (
              <dl className="space-y-3">
                <Detail label="Hotel category" value={preferences.hotelCategory ?? '—'} />
                <Detail label="Meal preference" value={preferences.mealPreference ?? '—'} />
                <Detail label="Seat preference" value={preferences.seatPreference ?? '—'} />
                {preferences.interests && preferences.interests.length > 0 && (
                  <div>
                    <dt className="text-xs text-ink-500">Interests</dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">
                      {preferences.interests.map((i) => (
                        <Badge key={i} tone="teal">
                          {i}
                        </Badge>
                      ))}
                    </dd>
                  </div>
                )}
                {preferences.dietaryRestrictions && (
                  <Detail label="Dietary" value={preferences.dietaryRestrictions} />
                )}
                {preferences.accessibilityNeeds && (
                  <Detail label="Accessibility" value={preferences.accessibilityNeeds} />
                )}
              </dl>
            ) : (
              <p className="text-sm text-ink-500">
                No preferences recorded. Capturing these makes repeat quotations much faster.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Family &amp; group"
            action={
              <Button variant="ghost" size="sm" onClick={onLinkFamily}>
                Link member
              </Button>
            }
          />
          <CardBody>
            {data.group.length === 0 ? (
              <p className="text-sm text-ink-500">Not linked to a travel group.</p>
            ) : (
              <ul className="space-y-1">
                {data.group.map((m) => (
                  <li key={m.memberId} className="group/member flex items-center gap-2.5 py-0.5">
                    <Users className="size-3.5 shrink-0 text-ink-400" aria-hidden />
                    <Link
                      to={`/customers/${m.memberId}`}
                      className="text-sm text-ink-800 hover:text-teal-700"
                    >
                      {m.memberName}
                    </Link>
                    {m.relationship && (
                      <span className="text-xs text-ink-400">{m.relationship}</span>
                    )}
                    <button
                      type="button"
                      aria-label={`Unlink ${m.memberName}`}
                      onClick={() =>
                        unlink.mutate({ id: data.customer.id, memberId: m.memberId })
                      }
                      className="ml-auto rounded p-1 text-ink-300 opacity-0 transition hover:bg-danger-50 hover:text-danger-600 focus-visible:opacity-100 group-hover/member:opacity-100"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <PassportsPanel customerId={customer.id} passports={data.passports} />
        </Card>
      </div>
    </div>
  );
}

function HistoryTab({ data }: { data: NonNullable<ReturnType<typeof useCustomer>['data']> }) {
  return (
    <Card>
      <CardHeader title="Travel history" description="Confirmed and completed bookings" />
      {data.bookings.length === 0 ? (
        <EmptyState
          title="No bookings yet"
          description="Once an enquiry converts and a booking is confirmed, it appears here."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] border-collapse text-sm">
            <thead>
              <tr className="data-table-head text-left text-xs font-medium text-ink-500">
                <th className="px-3 py-2.5 pl-5 font-medium">Booking</th>
                <th className="px-3 py-2.5 font-medium">Travel dates</th>
                <th className="px-3 py-2.5 text-right font-medium">Total</th>
                <th className="px-3 py-2.5 text-right font-medium">Received</th>
                <th className="px-3 py-2.5 text-right font-medium">Outstanding</th>
                <th className="px-3 py-2.5 pr-5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200/70">
              {data.bookings.map((b) => (
                <tr key={b.id} className="hover:bg-ink-50/70">
                  <td className="py-3 pl-5 pr-3 font-mono text-xs text-ink-800">{b.bookingCode}</td>
                  <td className="px-3 py-3 text-xs text-ink-600">
                    {b.travelStartDate ? formatDate(b.travelStartDate) : '—'}
                    {b.travelEndDate && ` – ${formatDate(b.travelEndDate)}`}
                  </td>
                  <td className="tabular px-3 py-3 text-right text-ink-800">{formatMoney(b.totalAmount)}</td>
                  <td className="tabular px-3 py-3 text-right text-success-700">
                    {formatMoney(b.amountReceived)}
                  </td>
                  <td
                    className={cn(
                      'tabular px-3 py-3 text-right',
                      b.amountOutstanding > 0 ? 'font-medium text-warm-700' : 'text-ink-400',
                    )}
                  >
                    {formatMoney(b.amountOutstanding)}
                  </td>
                  <td className="py-3 pl-3 pr-5">
                    <StatusBadge value={b.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function TimelineTab({ customerId }: { customerId: string }) {
  const timeline = useCustomerTimeline(customerId);
  const addNote = useAddCustomerNote();
  const [noteBody, setNoteBody] = useState('');

  const submitNote = async () => {
    if (!noteBody.trim()) return;
    await addNote.mutateAsync({ id: customerId, body: noteBody.trim() });
    setNoteBody('');
  };

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader
          title="Activity"
          description="Enquiries, bookings, payments, documents and notes in one thread"
        />
        {timeline.isPending ? (
          <LoadingState />
        ) : timeline.isError ? (
          <ErrorState error={timeline.error} onRetry={() => void timeline.refetch()} />
        ) : timeline.data?.length ? (
          <ol className="divide-y divide-ink-200/70">
            {timeline.data.map((entry, i) => (
              <li key={i} className="flex gap-3 px-5 py-3.5">
                <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', KIND_DOT[entry.kind])} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-800">{describeEntry(entry)}</p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {timeAgo(entry.at)}
                    {typeof entry.actor === 'string' && ` · ${entry.actor}`}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState title="No activity yet" />
        )}
      </Card>

      <Card>
        <CardHeader title="Add a note" />
        <CardBody className="space-y-3">
          <Textarea
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder="Anything the team should know"
            aria-label="Note"
          />
          <div className="flex justify-end">
            <Button
              leadingIcon={<StickyNote className="size-4" aria-hidden />}
              disabled={!noteBody.trim()}
              loading={addNote.isPending}
              onClick={() => void submitNote()}
            >
              Save note
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

const KIND_DOT: Record<string, string> = {
  LEAD: 'bg-cold-500',
  BOOKING: 'bg-success-500',
  PAYMENT: 'bg-teal-500',
  DOCUMENT: 'bg-ink-400',
  FOLLOWUP: 'bg-warm-500',
  NOTE: 'bg-ink-300',
};

function describeEntry(entry: { kind: string; [key: string]: unknown }): string {
  switch (entry.kind) {
    case 'LEAD':
      return `Enquiry ${String(entry.leadCode)} raised${entry.destination ? ` for ${String(entry.destination)}` : ''}`;
    case 'BOOKING':
      return `Booking ${String(entry.bookingCode)} created — ${formatMoney(Number(entry.totalAmount))}`;
    case 'PAYMENT':
      return `${entry.isRefund ? 'Refund' : 'Payment'} of ${formatMoney(Number(entry.amount))} recorded`;
    case 'DOCUMENT':
      return `Document uploaded: ${String(entry.title)}`;
    case 'FOLLOWUP':
      return `${String(entry.type)} follow-up completed${entry.outcome ? ` — ${String(entry.outcome)}` : ''}`;
    case 'NOTE':
      return String(entry.body);
    default:
      return 'Activity';
  }
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: 'warn';
}) {
  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-ink-500">
        <span className="text-ink-400">{icon}</span>
        {label}
      </p>
      <p
        className={cn(
          'tabular mt-0.5 text-base font-semibold',
          tone === 'warn' ? 'text-warm-600' : 'text-ink-900',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink-900">{value}</dd>
    </div>
  );
}
