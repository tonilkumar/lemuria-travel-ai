import {
  calculateCosting,
  formatBps,
  PASS_THROUGH_CATEGORIES,
  SERVICE_CATEGORIES,
  type ServiceCategory,
  type TaxBasis,
} from '@lemuria/shared';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useTaxRates, useUpsertPackage, type QuotationItem, type QuotationPackage } from './api';

interface DraftItem {
  key: string;
  category: ServiceCategory;
  description: string;
  quantity: string;
  unitCost: string;
  dayNumber: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  HOTEL: 'Hotel',
  FLIGHT: 'Flight',
  TRANSFER: 'Transfer',
  ACTIVITY: 'Activity',
  MEAL: 'Meals',
  GUIDE: 'Guide',
  VISA: 'Visa fee',
  INSURANCE: 'Insurance',
  PERMIT: 'Permit',
  MISC: 'Other',
};

let keyCounter = 0;
const newKey = () => `item-${++keyCounter}`;

/**
 * The costing form.
 *
 * Totals shown here are computed by the *same* `calculateCosting` the server
 * uses to persist them, imported from the shared package. Re-implementing the
 * arithmetic in the browser would eventually disagree with the server, and the
 * disagreement would be money.
 */
export function PackageEditorModal({
  open,
  onClose,
  versionId,
  existing,
  existingItems,
  defaultTravellers,
}: {
  open: boolean;
  onClose: () => void;
  versionId: string;
  existing?: QuotationPackage | undefined;
  existingItems: QuotationItem[];
  defaultTravellers: number;
}) {
  const { can } = useAuth();
  const upsert = useUpsertPackage();
  const taxRates = useTaxRates();

  const canDiscount = can('quotation.view_margin');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isRecommended, setIsRecommended] = useState(false);
  const [markupBps, setMarkupBps] = useState('1500');
  const [discountBps, setDiscountBps] = useState('0');
  const [discountReason, setDiscountReason] = useState('');
  const [travellerCount, setTravellerCount] = useState(String(defaultTravellers));
  const [taxRateId, setTaxRateId] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    if (existing) {
      setName(existing.name);
      setDescription(existing.description ?? '');
      setIsRecommended(existing.isRecommended);
      setMarkupBps(String(existing.markupBps ?? 0));
      setDiscountBps(String(existing.discountBps));
      setDiscountReason(existing.discountReason ?? '');
      setTravellerCount(String(existing.travellerCount || defaultTravellers));
      setItems(
        existingItems.map((i) => ({
          key: newKey(),
          category: i.category as ServiceCategory,
          description: i.description,
          quantity: String(i.quantity),
          unitCost: i.unitCost !== null ? String(i.unitCost / 100) : '',
          dayNumber: i.dayNumber !== null ? String(i.dayNumber) : '',
        })),
      );
    } else {
      setName('');
      setDescription('');
      setIsRecommended(false);
      setMarkupBps('1500');
      setDiscountBps('0');
      setDiscountReason('');
      setTravellerCount(String(defaultTravellers));
      setItems([
        { key: newKey(), category: 'HOTEL', description: '', quantity: '1', unitCost: '', dayNumber: '' },
      ]);
    }
  }, [open, existing, existingItems, defaultTravellers]);

  /** The tax treatment the server will pick, mirrored so the preview matches. */
  const resolvedTax = useMemo(() => {
    if (taxRateId) return taxRates.data?.find((r) => r.id === taxRateId) ?? null;

    const costByCategory = new Map<string, number>();
    for (const item of items) {
      const value = (Number(item.unitCost) || 0) * (Number(item.quantity) || 0);
      costByCategory.set(item.category, (costByCategory.get(item.category) ?? 0) + value);
    }
    const dominant = [...costByCategory.entries()].sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'MISC';
    return taxRates.data?.find((r) => r.serviceCategory === dominant) ?? null;
  }, [taxRateId, taxRates.data, items]);

  const preview = useMemo(() => {
    let markupBase = 0;
    let passThrough = 0;
    for (const item of items) {
      const line = Math.round((Number(item.unitCost) || 0) * 100) * (Number(item.quantity) || 0);
      if (PASS_THROUGH_CATEGORIES.includes(item.category)) passThrough += line;
      else markupBase += line;
    }

    return calculateCosting({
      supplierCostPaise: markupBase,
      otherCostPaise: passThrough,
      markupBps: Number(markupBps) || 0,
      discountBps: Number(discountBps) || 0,
      gstBps: resolvedTax?.rateBps ?? 0,
      taxBasis: (resolvedTax?.basis as TaxBasis) ?? 'EXEMPT',
      travellerCount: Number(travellerCount) || 0,
    });
  }, [items, markupBps, discountBps, resolvedTax, travellerCount]);

  const updateItem = (key: string, patch: Partial<DraftItem>) =>
    setItems((current) => current.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const submit = async () => {
    setFormError(null);
    if (!name.trim()) return setFormError('Name the package.');

    const usable = items.filter((i) => i.description.trim() && Number(i.unitCost) >= 0);
    if (usable.length === 0) return setFormError('Add at least one service with a cost.');
    if (Number(discountBps) > 0 && !discountReason.trim()) {
      return setFormError('Record why a discount is being given.');
    }

    try {
      await upsert.mutateAsync({
        versionId,
        ...(existing ? { id: existing.id } : {}),
        name: name.trim(),
        description: description.trim() || undefined,
        isRecommended,
        sortOrder: existing?.sortOrder ?? 0,
        markupBps: Number(markupBps) || 0,
        discountBps: Number(discountBps) || 0,
        ...(Number(discountBps) > 0 ? { discountReason: discountReason.trim() } : {}),
        ...(taxRateId ? { taxRateId } : {}),
        travellerCount: Number(travellerCount) || 0,
        items: usable.map((i, index) => ({
          category: i.category,
          description: i.description.trim(),
          quantity: Number(i.quantity) || 1,
          unitCost: Number(i.unitCost) || 0,
          ...(i.dayNumber ? { dayNumber: Number(i.dayNumber) } : {}),
          isPassThrough: PASS_THROUGH_CATEGORIES.includes(i.category),
          sortOrder: index,
        })),
      });
      onClose();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save the package.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? `Edit ${existing.name}` : 'Add a package'}
      description="Enter supplier costs. Markup, tax and margin are calculated."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={upsert.isPending} onClick={() => void submit()}>
            {existing ? 'Save package' : 'Add package'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {formError && (
          <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-600">
            {formError}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Input
              label="Package name"
              required
              placeholder="Gold"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Input
            label="Travellers"
            type="number"
            min={0}
            hint="For the per-person figure"
            value={travellerCount}
            onChange={(e) => setTravellerCount(e.target.value)}
          />
        </div>

        <Textarea
          label="Description"
          placeholder="5-star beachfront with private transfers"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            className="size-4 rounded border-ink-300 text-teal-600"
            checked={isRecommended}
            onChange={(e) => setIsRecommended(e.target.checked)}
          />
          Mark as the recommended option
        </label>

        {/* ── Services ──────────────────────────────────────────────────── */}
        <Field label="Services" hint="Enter what the supplier charges, per unit, in rupees">
          <div className="space-y-2">
            {items.map((item) => {
              const passThrough = PASS_THROUGH_CATEGORIES.includes(item.category);
              return (
                <div
                  key={item.key}
                  className="grid grid-cols-12 items-start gap-2 rounded-lg border border-ink-200 p-2"
                >
                  <div className="col-span-4 sm:col-span-3">
                    <Select
                      aria-label="Category"
                      value={item.category}
                      onChange={(e) =>
                        updateItem(item.key, { category: e.target.value as ServiceCategory })
                      }
                      options={SERVICE_CATEGORIES.map((c) => ({
                        value: c,
                        label: CATEGORY_LABEL[c] ?? c,
                      }))}
                    />
                    {passThrough && (
                      <p className="mt-1 text-[10px] text-ink-500">at cost, no markup</p>
                    )}
                  </div>
                  <div className="col-span-8 sm:col-span-4">
                    <Input
                      aria-label="Description"
                      placeholder="Ayana Resort, ocean view"
                      value={item.description}
                      onChange={(e) => updateItem(item.key, { description: e.target.value })}
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-1">
                    <Input
                      aria-label="Quantity"
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Input
                      aria-label="Unit cost in rupees"
                      type="number"
                      min={0}
                      placeholder="18000"
                      value={item.unitCost}
                      onChange={(e) => updateItem(item.key, { unitCost: e.target.value })}
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-1">
                    <Input
                      aria-label="Day number"
                      type="number"
                      min={0}
                      placeholder="Day"
                      value={item.dayNumber}
                      onChange={(e) => updateItem(item.key, { dayNumber: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1 flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove service"
                      className="text-ink-400 hover:text-danger-600"
                      onClick={() => setItems((c) => c.filter((i) => i.key !== item.key))}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            leadingIcon={<Plus className="size-4" aria-hidden />}
            onClick={() =>
              setItems((c) => [
                ...c,
                {
                  key: newKey(),
                  category: 'HOTEL',
                  description: '',
                  quantity: '1',
                  unitCost: '',
                  dayNumber: '',
                },
              ])
            }
          >
            Add service
          </Button>
        </Field>

        {/* ── Pricing ───────────────────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Markup"
            type="number"
            min={0}
            hint={`${formatBps(Number(markupBps) || 0)} over cost`}
            value={markupBps}
            onChange={(e) => setMarkupBps(e.target.value)}
          />
          {canDiscount ? (
            <Input
              label="Discount"
              type="number"
              min={0}
              hint={`${formatBps(Number(discountBps) || 0)} off the marked-up price`}
              value={discountBps}
              onChange={(e) => setDiscountBps(e.target.value)}
            />
          ) : (
            <Field label="Discount" hint="Discounts need manager permission">
              <div className="flex h-9.5 items-center rounded-lg border border-ink-200 bg-ink-50 px-3 text-sm text-ink-400">
                Not available
              </div>
            </Field>
          )}
        </div>

        {canDiscount && Number(discountBps) > 0 && (
          <Input
            label="Reason for the discount"
            required
            placeholder="Repeat customer, matching a competitor quote"
            value={discountReason}
            onChange={(e) => setDiscountReason(e.target.value)}
          />
        )}

        <Select
          label="Tax treatment"
          placeholder={
            resolvedTax
              ? `Automatic — ${resolvedTax.name}`
              : 'Automatic — based on the largest service'
          }
          value={taxRateId}
          onChange={(e) => setTaxRateId(e.target.value)}
          options={(taxRates.data ?? []).map((r) => ({
            value: r.id,
            label: `${r.name} (${formatBps(r.rateBps)} ${r.basis.toLowerCase()})`,
          }))}
        />

        {resolvedTax?.isProvisional && (
          <p className="flex items-start gap-2 rounded-lg bg-warm-50 px-3 py-2.5 text-xs text-warm-700">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              This rate is a placeholder awaiting confirmation by Lemuria's accountant. The quotation
              PDF says so until it is confirmed.
            </span>
          </p>
        )}

        {/* ── Live totals ───────────────────────────────────────────────── */}
        <div className="rounded-lg border border-ink-200 bg-ink-50/60 p-4">
          <p className="mb-2 text-xs font-semibold text-ink-700">Calculated price</p>
          <dl className="space-y-1.5 text-sm">
            <Row label="Supplier cost" value={formatMoney(preview.supplierCost)} />
            {preview.otherCost > 0 && (
              <Row label="Billed at cost (no markup)" value={formatMoney(preview.otherCost)} />
            )}
            <Row label={`Markup ${formatBps(Number(markupBps) || 0)}`} value={formatMoney(preview.markupAmount)} />
            {preview.discountAmount > 0 && (
              <Row label="Discount" value={`− ${formatMoney(preview.discountAmount)}`} tone="warn" />
            )}
            <Row label="Before tax" value={formatMoney(preview.netBeforeTax)} />
            {preview.gstAmount > 0 && (
              <Row
                label={`Tax ${formatBps(resolvedTax?.rateBps ?? 0)} on ${(resolvedTax?.basis ?? 'gross').toLowerCase()}`}
                value={formatMoney(preview.gstAmount)}
              />
            )}
            <div className="border-t border-ink-200 pt-1.5">
              <Row label="Customer pays" value={formatMoney(preview.sellingPrice)} bold />
              {preview.perPerson !== null && (
                <Row label="Per person" value={formatMoney(preview.perPerson)} muted />
              )}
            </div>
            {canDiscount && (
              <div className="border-t border-ink-200 pt-1.5">
                <Row
                  label="Margin"
                  value={`${formatMoney(preview.marginAmount)} · ${formatBps(preview.marginBps)}`}
                  tone={preview.isLossMaking ? 'danger' : preview.marginBps < 1000 ? 'warn' : 'ok'}
                  bold
                />
              </div>
            )}
          </dl>

          {preview.isLossMaking && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-danger-600">
              <AlertTriangle className="size-3.5" aria-hidden />
              This package makes no margin. It will need approval before it can be sent.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
  tone,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  tone?: 'warn' | 'danger' | 'ok';
}) {
  const TONE = { warn: 'text-warm-700', danger: 'text-danger-600', ok: 'text-success-700' } as const;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn('text-ink-600', bold && 'font-semibold text-ink-900', muted && 'text-xs')}>
        {label}
      </dt>
      <dd
        className={cn(
          'tabular',
          bold ? 'font-semibold' : '',
          muted ? 'text-xs text-ink-500' : '',
          tone ? TONE[tone] : bold ? 'text-ink-900' : 'text-ink-700',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
