import { formatBps } from '@lemuria/shared';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  FileDown,
  GitBranch,
  Pencil,
  Plus,
  Send,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  StatusBadge,
  Textarea,
} from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { ApiError } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ContentPanel } from './ContentPanel';
import { PackageEditorModal } from './PackageEditorModal';
import {
  openQuotationPdf,
  useCreateVersion,
  useDecideApproval,
  useDeletePackage,
  useQuotation,
  useSendQuotation,
  useSubmitForApproval,
  type QuotationPackage,
} from './api';

const TRIGGER_COPY: Record<string, string> = {
  HIGH_VALUE: 'the value is above the approval threshold',
  LOW_MARGIN: 'the margin is below the approval threshold',
  LOSS_MAKING: 'it makes no margin at all',
};

export function QuotationBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const { can, user } = useAuth();
  const detail = useQuotation(id);

  const [editing, setEditing] = useState<QuotationPackage | null>(null);
  const [adding, setAdding] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);

  const submit = useSubmitForApproval();
  const send = useSendQuotation();
  const newVersion = useCreateVersion();
  const removePackage = useDeletePackage();

  if (detail.isPending) return <LoadingState label="Loading quotation" />;
  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;

  const data = detail.data;
  if (!data?.currentVersion) return <ErrorState error={new Error('No version found')} />;

  const { quotation, currentVersion: version, packages, items } = data;
  const editable = version.status === 'DRAFT' || version.status === 'REJECTED';
  const triggers = version.approvalTriggers ?? [];

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBanner(null);
    try {
      await fn();
      setBanner({ tone: 'ok', text: ok });
    } catch (err) {
      setBanner({
        tone: 'error',
        text: err instanceof ApiError ? err.message : 'That action could not be completed.',
      });
    }
  };

  return (
    <>
      <div className="border-b border-ink-200 bg-white px-4 py-5 sm:px-6">
        <Link
          to="/quotations"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-teal-700"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to quotations
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-lg font-semibold text-ink-900">{quotation.title}</h1>
              <StatusBadge value={version.status} />
              <Badge tone="neutral">V{version.versionNumber}</Badge>
              {version.taxIsProvisional && (
                <Badge tone="warm">
                  <AlertTriangle className="size-3" aria-hidden />
                  Tax provisional
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-500">
              <span className="font-mono text-xs">{quotation.quotationCode}</span>
              {data.customer && (
                <>
                  <span className="mx-1.5 text-ink-300">·</span>
                  <Link
                    to={`/customers/${data.customer.id}`}
                    className="hover:text-teal-700"
                  >
                    {data.customer.fullName}
                  </Link>
                </>
              )}
              {quotation.destination && (
                <>
                  <span className="mx-1.5 text-ink-300">·</span>
                  {quotation.destination}
                </>
              )}
              {quotation.travelStartDate && (
                <>
                  <span className="mx-1.5 text-ink-300">·</span>
                  {formatDate(quotation.travelStartDate)}
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              leadingIcon={<FileDown className="size-4" aria-hidden />}
              onClick={() => void act(() => openQuotationPdf(version.id), 'PDF opened in a new tab.')}
            >
              Preview PDF
            </Button>

            {editable && can('quotation.update') && packages.length > 0 && (
              <Button
                leadingIcon={<Check className="size-4" aria-hidden />}
                loading={submit.isPending}
                onClick={() =>
                  void act(async () => {
                    const result = await submit.mutateAsync(version.id);
                    setBanner({
                      tone: result.needsApproval ? 'warn' : 'ok',
                      text: result.needsApproval
                        ? `Sent for approval — ${result.triggers.map((t) => TRIGGER_COPY[t] ?? t).join(' and ')}.`
                        : 'Approved automatically. Ready to send.',
                    });
                  }, '')
                }
              >
                Submit
              </Button>
            )}

            {version.status === 'PENDING_APPROVAL' && can('quotation.approve') && (
              <Button
                leadingIcon={<ThumbsUp className="size-4" aria-hidden />}
                onClick={() => setDecisionOpen(true)}
              >
                Review
              </Button>
            )}

            {version.status === 'APPROVED' && can('quotation.send') && (
              <Button
                leadingIcon={<Send className="size-4" aria-hidden />}
                loading={send.isPending}
                onClick={() =>
                  void act(
                    () => send.mutateAsync({ versionId: version.id, channel: 'EMAIL' }),
                    'Marked as sent.',
                  )
                }
              >
                Send
              </Button>
            )}

            {!editable && can('quotation.update') && (
              <Button
                variant="secondary"
                leadingIcon={<GitBranch className="size-4" aria-hidden />}
                loading={newVersion.isPending}
                onClick={() =>
                  void act(
                    () => newVersion.mutateAsync(quotation.id),
                    `V${version.versionNumber + 1} started from V${version.versionNumber}.`,
                  )
                }
              >
                New version
              </Button>
            )}
          </div>
        </div>

        {/* Version history */}
        {data.versions.length > 1 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-ink-500">Versions</span>
            {data.versions.map((v) => (
              <span
                key={v.id}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[11px] font-medium',
                  v.id === version.id ? 'bg-teal-100 text-teal-800' : 'bg-ink-100 text-ink-500',
                )}
                title={`${v.status} · ${formatMoney(v.totalSellingPrice)}`}
              >
                V{v.versionNumber}
              </span>
            ))}
          </div>
        )}
      </div>

      {banner && (
        <div
          role="status"
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm sm:px-6',
            banner.tone === 'ok'
              ? 'bg-success-50 text-success-700'
              : banner.tone === 'warn'
                ? 'bg-warm-50 text-warm-700'
                : 'bg-danger-50 text-danger-600',
          )}
        >
          {banner.tone === 'error' ? (
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
          ) : (
            <Check className="size-4 shrink-0" aria-hidden />
          )}
          {banner.text}
        </div>
      )}

      {version.status === 'PENDING_APPROVAL' && (
        <div className="flex items-start gap-2 border-b border-warm-200 bg-warm-50 px-4 py-3 text-sm text-warm-800 sm:px-6">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">Waiting on a manager.</strong> This version needs
            approval because {triggers.map((t) => TRIGGER_COPY[t] ?? t).join(' and ')}. It cannot be
            sent until someone other than the submitter approves it.
          </span>
        </div>
      )}

      <div className="grid gap-5 p-4 sm:p-6 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader
              title={packages.length > 1 ? 'Package tiers' : 'Package'}
              description={
                editable ? 'Enter supplier costs; pricing is calculated' : 'This version is frozen'
              }
              action={
                editable && can('quotation.update') ? (
                  <Button
                    size="sm"
                    leadingIcon={<Plus className="size-4" aria-hidden />}
                    onClick={() => setAdding(true)}
                  >
                    Add package
                  </Button>
                ) : null
              }
            />

            {packages.length === 0 ? (
              <EmptyState
                title="No packages yet"
                description="Add a tier with its services to start pricing."
                action={
                  editable && can('quotation.update') ? (
                    <Button size="sm" onClick={() => setAdding(true)}>
                      Add the first package
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="divide-y divide-ink-200/70">
                {packages.map((pkg) => (
                  <li key={pkg.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-ink-900">{pkg.name}</h3>
                          {pkg.isRecommended && <Badge tone="teal">Recommended</Badge>}
                          {pkg.discountAmount > 0 && (
                            <Badge tone="warm">{formatBps(pkg.discountBps)} off</Badge>
                          )}
                        </div>
                        {pkg.description && (
                          <p className="mt-0.5 text-xs text-ink-500">{pkg.description}</p>
                        )}
                      </div>

                      <div className="text-right">
                        <p className="tabular text-lg font-semibold text-ink-900">
                          {formatMoney(pkg.sellingPrice)}
                        </p>
                        {pkg.perPersonPrice && (
                          <p className="tabular text-[11px] text-ink-500">
                            {formatMoney(pkg.perPersonPrice)} per person
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Costing breakdown, redacted for anyone without margin access */}
                    <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                      {data.canSeeMargin && (
                        <>
                          <Cell label="Supplier cost" value={formatMoney(pkg.supplierCost)} />
                          <Cell
                            label={`Markup ${formatBps(pkg.markupBps ?? 0)}`}
                            value={formatMoney(pkg.markupAmount)}
                          />
                        </>
                      )}
                      <Cell label="Before tax" value={formatMoney(pkg.netBeforeTax)} />
                      <Cell
                        label={`Tax ${formatBps(pkg.gstBps)}${pkg.taxIsProvisional ? '*' : ''}`}
                        value={formatMoney(pkg.gstAmount)}
                        tone={pkg.taxIsProvisional ? 'warn' : undefined}
                      />
                      {data.canSeeMargin && pkg.marginBps !== null && (
                        <Cell
                          label="Margin"
                          value={`${formatMoney(pkg.marginAmount)} · ${formatBps(pkg.marginBps)}`}
                          tone={
                            pkg.marginBps <= 0 ? 'danger' : pkg.marginBps < 1000 ? 'warn' : 'ok'
                          }
                        />
                      )}
                    </dl>

                    {pkg.discountReason && (
                      <p className="mt-2 text-xs text-warm-700">
                        Discount reason: {pkg.discountReason}
                      </p>
                    )}

                    <ul className="mt-3 space-y-1">
                      {items
                        .filter((i) => i.packageId === pkg.id)
                        .map((item) => (
                          <li key={item.id} className="flex items-baseline gap-3 text-xs">
                            <span className="w-16 shrink-0 font-medium text-teal-700">
                              {item.dayNumber ? `Day ${item.dayNumber}` : item.category.toLowerCase()}
                            </span>
                            <span className="flex-1 text-ink-600">
                              {item.description}
                              {item.quantity > 1 && ` ×${item.quantity}`}
                            </span>
                            {data.canSeeMargin && item.totalCost !== null && (
                              <span className="tabular text-ink-400">
                                {formatMoney(item.totalCost)}
                              </span>
                            )}
                          </li>
                        ))}
                    </ul>

                    {editable && can('quotation.update') && (
                      <div className="mt-3 flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          leadingIcon={<Pencil className="size-3.5" aria-hidden />}
                          onClick={() => setEditing(pkg)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-ink-400 hover:text-danger-600"
                          leadingIcon={<Trash2 className="size-3.5" aria-hidden />}
                          onClick={() =>
                            void act(
                              () =>
                                removePackage.mutateAsync({
                                  versionId: version.id,
                                  packageId: pkg.id,
                                }),
                              `${pkg.name} removed.`,
                            )
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <ContentPanel version={version} editable={editable} />
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Version total" />
            <CardBody>
              <dl className="space-y-2 text-sm">
                {data.canSeeMargin && (
                  <Row label="Supplier cost" value={formatMoney(version.totalSupplierCost)} />
                )}
                {version.totalDiscount > 0 && (
                  <Row
                    label="Discount"
                    value={`− ${formatMoney(version.totalDiscount)}`}
                    tone="warn"
                  />
                )}
                <Row label="Before tax" value={formatMoney(version.totalNetBeforeTax)} />
                <Row label="Tax" value={formatMoney(version.totalGst)} />
                <div className="border-t border-ink-200 pt-2">
                  <Row
                    label="Customer pays"
                    value={formatMoney(version.totalSellingPrice)}
                    bold
                  />
                </div>
                {data.canSeeMargin && version.marginBps !== null && (
                  <div className="border-t border-ink-200 pt-2">
                    <Row
                      label="Margin"
                      value={`${formatMoney(version.marginAmount)} · ${formatBps(version.marginBps)}`}
                      bold
                      tone={
                        version.marginBps <= 0 ? 'danger' : version.marginBps < 1000 ? 'warn' : 'ok'
                      }
                    />
                  </div>
                )}
              </dl>

              {version.taxIsProvisional && (
                <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-warm-50 px-2.5 py-2 text-[11px] text-warm-700">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
                  <span>
                    Tax is priced at a placeholder rate awaiting confirmation. The PDF says so.
                  </span>
                </p>
              )}
            </CardBody>
          </Card>

          {data.approvals.length > 0 && (
            <Card>
              <CardHeader title="Approval history" />
              <ul className="divide-y divide-ink-200/70">
                {data.approvals.map((a) => (
                  <li key={a.id} className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          a.decision === 'APPROVED'
                            ? 'success'
                            : a.decision === 'REJECTED'
                              ? 'danger'
                              : 'warm'
                        }
                      >
                        {a.decision.toLowerCase()}
                      </Badge>
                      {a.triggerReason && (
                        <span className="text-[11px] text-ink-500">
                          {a.triggerReason.split(',').map((t) => TRIGGER_COPY[t] ?? t).join('; ')}
                        </span>
                      )}
                    </div>
                    {a.comments && <p className="mt-1 text-xs text-ink-600">{a.comments}</p>}
                    <p className="mt-0.5 text-[10px] text-ink-400">
                      requested by {a.requestedBy ?? 'someone'}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <PackageEditorModal
        open={adding || editing !== null}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        versionId={version.id}
        existing={editing ?? undefined}
        existingItems={editing ? items.filter((i) => i.packageId === editing.id) : []}
        defaultTravellers={quotation.travellersAdults + quotation.travellersChildren}
      />

      <DecisionModal
        open={decisionOpen}
        onClose={() => setDecisionOpen(false)}
        versionId={version.id}
        triggers={triggers}
        submittedByMe={data.approvals.some(
          (a) => a.decision === 'PENDING' && a.requestedBy === user?.fullName,
        )}
      />
    </>
  );
}

function DecisionModal({
  open,
  onClose,
  versionId,
  triggers,
  submittedByMe,
}: {
  open: boolean;
  onClose: () => void;
  versionId: string;
  triggers: string[];
  submittedByMe: boolean;
}) {
  const decide = useDecideApproval();
  const [comments, setComments] = useState('');
  const [error, setError] = useState<string | null>(null);

  const act = async (decision: 'APPROVED' | 'REJECTED') => {
    setError(null);
    if (decision === 'REJECTED' && !comments.trim()) {
      setError('Say what needs to change.');
      return;
    }
    try {
      await decide.mutateAsync({ versionId, decision, comments: comments.trim() || undefined });
      setComments('');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record that decision.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Review this quotation"
      description={`Approval is required because ${triggers.map((t) => TRIGGER_COPY[t] ?? t).join(' and ')}.`}
      size="sm"
      footer={
        <>
          <Button
            variant="secondary"
            leadingIcon={<ThumbsDown className="size-4" aria-hidden />}
            loading={decide.isPending}
            onClick={() => void act('REJECTED')}
          >
            Send back
          </Button>
          <Button
            leadingIcon={<ThumbsUp className="size-4" aria-hidden />}
            loading={decide.isPending}
            onClick={() => void act('APPROVED')}
          >
            Approve
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-600">
            {error}
          </p>
        )}
        {submittedByMe && (
          <p className="rounded-lg bg-warm-50 px-3 py-2.5 text-sm text-warm-700">
            You submitted this version, so you cannot approve it yourself. Ask another manager.
          </p>
        )}
        <Textarea
          label="Comments"
          placeholder="Required when sending back"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
        />
      </div>
    </Modal>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warn' | 'danger' | 'ok';
}) {
  const TONE = { warn: 'text-warm-700', danger: 'text-danger-600', ok: 'text-success-700' } as const;
  return (
    <div>
      <dt className="text-[10px] text-ink-500">{label}</dt>
      <dd className={cn('tabular font-medium', tone ? TONE[tone] : 'text-ink-800')}>{value}</dd>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  tone,
}: {
  label: string;
  value: string;
  bold?: boolean;
  tone?: 'warn' | 'danger' | 'ok';
}) {
  const TONE = { warn: 'text-warm-700', danger: 'text-danger-600', ok: 'text-success-700' } as const;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn('text-ink-600', bold && 'font-semibold text-ink-900')}>{label}</dt>
      <dd className={cn('tabular', bold && 'font-semibold', tone ? TONE[tone] : 'text-ink-800')}>
        {value}
      </dd>
    </div>
  );
}
