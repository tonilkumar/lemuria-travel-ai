import {
  ArrowLeft,
  CalendarPlus,
  MessageCircle,
  Phone,
  StickyNote,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  ClassificationBadge,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusBadge,
  Textarea,
} from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { ConvertLeadModal } from '@/features/customers/ConvertLeadModal';
import { formatDate, formatMoney, formatPhone, formatRelativeDay, timeAgo } from '@/lib/format';
import { useAddNote, useLead, useLeadTimeline } from './api';

interface LeadDetail {
  lead: Record<string, any>;
  source: { name: string; colour: string | null } | null;
  travelType: { name: string } | null;
  assignedTo: { id: string; fullName: string; avatarUrl: string | null; designation: string | null } | null;
  customer: { id: string; customerCode: string; fullName: string; tier: string } | null;
}

/** Anchor styled to match Button's secondary variant. */
const ACTION_LINK =
  'inline-flex h-9.5 items-center gap-2 rounded-lg border border-ink-300 bg-white px-4 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50';

interface TimelineEntry {
  kind: 'STATUS' | 'ASSIGNMENT' | 'FOLLOWUP' | 'NOTE';
  at: string;
  [key: string]: unknown;
}

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const detail = useLead(id);
  const timeline = useLeadTimeline(id);
  const addNote = useAddNote();
  const [noteBody, setNoteBody] = useState('');
  const [convertOpen, setConvertOpen] = useState(false);

  if (detail.isPending) return <LoadingState label="Loading lead" />;
  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;

  const data = detail.data as unknown as LeadDetail;
  const lead = data.lead;

  const submitNote = async () => {
    if (!id || !noteBody.trim()) return;
    await addNote.mutateAsync({ id, body: noteBody.trim() });
    setNoteBody('');
  };

  return (
    <>
      <div className="border-b border-ink-200 bg-white px-4 py-5 sm:px-6">
        <Link
          to="/leads"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-teal-700"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to leads
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-lg font-semibold text-ink-900">{lead.customerName}</h1>
              <ClassificationBadge value={lead.classification} score={lead.score} />
              <StatusBadge value={lead.status} />
            </div>
            <p className="tabular mt-1 text-sm text-ink-500">
              {formatPhone(lead.phone)}
              {lead.email && (
                <>
                  <span className="mx-1.5 text-ink-300">·</span>
                  {lead.email}
                </>
              )}
              <span className="mx-1.5 text-ink-300">·</span>
              <span className="font-mono text-xs">{lead.leadCode}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Anchors, not buttons: these navigate, and an <a> inside a
                <button> is invalid markup that breaks keyboard activation. */}
            <a href={`tel:${lead.phone}`} className={ACTION_LINK}>
              <Phone className="size-4" aria-hidden />
              Call
            </a>
            <a
              href={`https://wa.me/91${lead.phone}`}
              target="_blank"
              rel="noreferrer noopener"
              className={ACTION_LINK}
            >
              <MessageCircle className="size-4" aria-hidden />
              WhatsApp
            </a>
            {can('followup.create') && (
              <Button
                variant="secondary"
                leadingIcon={<CalendarPlus className="size-4" aria-hidden />}
              >
                Schedule follow-up
              </Button>
            )}

            {/* Converting is only offered where it is actually legal — an OPEN
                lead would be rejected by the server, so do not tease it. */}
            {can('lead.convert', 'customer.create') && lead.status !== 'CONVERTED' && (
              <Button
                leadingIcon={<UserPlus className="size-4" aria-hidden />}
                disabled={lead.status === 'OPEN'}
                title={
                  lead.status === 'OPEN'
                    ? 'Work the enquiry or send a quotation before converting'
                    : undefined
                }
                onClick={() => setConvertOpen(true)}
              >
                Convert to customer
              </Button>
            )}

            {lead.status === 'CONVERTED' && data.customer && (
              <Link to={`/customers/${data.customer.id}`} className={ACTION_LINK}>
                <UserCheck className="size-4" aria-hidden />
                View customer
              </Link>
            )}
          </div>
        </div>
      </div>

      <ConvertLeadModal
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        lead={{
          id: lead.id,
          leadCode: lead.leadCode,
          customerName: lead.customerName,
          phone: lead.phone,
          email: lead.email ?? null,
          customerId: lead.customerId ?? null,
        }}
      />

      <div className="grid gap-5 p-4 sm:p-6 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader title="Requirement" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                <Detail label="Destination" value={lead.destination ?? 'Not set'} />
                <Detail
                  label="Travel date"
                  value={
                    lead.travelDate
                      ? `${formatDate(lead.travelDate)}${lead.travelDateFlexible ? ' (flexible)' : ''}`
                      : 'Not decided'
                  }
                />
                <Detail label="Travel type" value={data.travelType?.name ?? 'Not set'} />
                <Detail
                  label="Travellers"
                  value={`${lead.travellersAdults} adult${lead.travellersAdults === 1 ? '' : 's'}${
                    lead.travellersChildren ? `, ${lead.travellersChildren} child` : ''
                  }`}
                />
                <Detail label="Budget" value={formatMoney(lead.budgetAmount)} />
                <Detail label="Source" value={data.source?.name ?? 'Unknown'} />
              </dl>

              {lead.notes && (
                <div className="mt-5 rounded-lg bg-ink-50 p-3">
                  <p className="text-xs font-medium text-ink-500">Enquiry notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{lead.notes}</p>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Activity"
              description="Status changes, assignments, follow-ups and notes"
            />
            {timeline.isPending ? (
              <LoadingState />
            ) : timeline.isError ? (
              <ErrorState error={timeline.error} onRetry={() => void timeline.refetch()} />
            ) : (timeline.data as unknown as TimelineEntry[])?.length ? (
              <ol className="divide-y divide-ink-200/70">
                {(timeline.data as unknown as TimelineEntry[]).map((entry, i) => (
                  <li key={i} className="flex gap-3 px-5 py-3.5">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-teal-500" aria-hidden />
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
                placeholder="What did the customer say?"
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

        <div className="space-y-5">
          <Card>
            <CardHeader title="Assignment" />
            <CardBody>
              {data.assignedTo ? (
                <div className="flex items-center gap-3">
                  <Avatar name={data.assignedTo.fullName} src={data.assignedTo.avatarUrl} size="lg" />
                  <div>
                    <p className="text-sm font-medium text-ink-900">{data.assignedTo.fullName}</p>
                    <p className="text-xs text-ink-500">{data.assignedTo.designation ?? 'Executive'}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-warm-600">Not assigned to anyone yet.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Lead score" />
            <CardBody>
              <div className="flex items-baseline gap-2">
                <span className="tabular text-3xl font-semibold text-ink-900">{lead.score}</span>
                <ClassificationBadge value={lead.classification} />
              </div>
              {lead.scoreReason && <p className="mt-2 text-sm text-ink-600">{lead.scoreReason}</p>}
              <p className="mt-3 text-[11px] text-ink-400">
                Scored from travel date, budget, source and engagement. A manager can override it.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Next follow-up" />
            <CardBody>
              {lead.nextFollowupAt ? (
                <p className="text-sm text-ink-800">{formatRelativeDay(lead.nextFollowupAt)}</p>
              ) : (
                <p className="text-sm text-ink-500">Nothing scheduled.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function describeEntry(entry: TimelineEntry): string {
  switch (entry.kind) {
    case 'STATUS':
      return entry.fromStatus
        ? `Status changed from ${String(entry.fromStatus)} to ${String(entry.toStatus)}`
        : `Enquiry created as ${String(entry.toStatus)}`;
    case 'ASSIGNMENT':
      return typeof entry.reason === 'string' && entry.reason ? entry.reason : 'Lead reassigned';
    case 'FOLLOWUP':
      return `${String(entry.type)} follow-up — ${String(entry.description)}`;
    case 'NOTE':
      return String(entry.body);
    default:
      return 'Activity';
  }
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink-900">{value}</dd>
    </div>
  );
}
