/**
 * Quotation costing.
 *
 * Every amount is integer paise and every rate is basis points (1 bp = 0.01%).
 * There is no floating point anywhere in this file, because the chain
 * cost → markup → discount → tax compounds rounding error into real rupees on
 * an invoice.
 *
 * This lives in the shared domain so the builder UI shows live totals computed
 * by the *same* function the server persists. Two implementations of this
 * arithmetic would eventually disagree, and the disagreement would be money.
 */

/**
 * How tax is applied. Indian travel GST genuinely has more than one treatment,
 * and which one applies is a decision for the client's accountant, not for this
 * code — so it is a per-category setting rather than a constant.
 *
 * - `GROSS`  — tax on the full pre-tax selling value (the 5%-without-ITC model)
 * - `MARGIN` — tax only on Lemuria's margin (tour-operator margin schemes)
 * - `EXEMPT` — no tax on this line
 */
export const TAX_BASES = ['GROSS', 'MARGIN', 'EXEMPT'] as const;
export type TaxBasis = (typeof TAX_BASES)[number];

export interface CostingInput {
  /** Sum of what suppliers charge us, in paise. */
  supplierCostPaise: number;
  /** Anything else billed through at cost — visa fees, insurance, permits. */
  otherCostPaise?: number;
  /** Markup over cost, in basis points. 1500 = 15%. */
  markupBps?: number;
  /** Flat markup instead of a percentage. When set, `markupBps` is ignored. */
  markupOverridePaise?: number | undefined;
  /** Discount off the marked-up price, in basis points. */
  discountBps?: number;
  /** Flat discount. When set, `discountBps` is ignored. */
  discountOverridePaise?: number | undefined;
  /** Tax rate in basis points. 500 = 5%. */
  gstBps?: number;
  taxBasis?: TaxBasis;
  /** Used only to derive a per-person figure for display. */
  travellerCount?: number;
}

export interface CostingResult {
  supplierCost: number;
  otherCost: number;
  /** supplierCost + otherCost */
  baseCost: number;
  markupAmount: number;
  discountAmount: number;
  /** baseCost + markup − discount. The pre-tax price the customer sees. */
  netBeforeTax: number;
  /** The amount tax was actually charged on, given the basis. */
  taxableValue: number;
  gstAmount: number;
  /** netBeforeTax + gst. What the customer pays. */
  sellingPrice: number;
  /** What Lemuria keeps before overheads: markup − discount. */
  marginAmount: number;
  /** Margin as basis points of the pre-tax price. Negative when selling at a loss. */
  marginBps: number;
  /** sellingPrice divided across travellers, rounded up so the total is never short. */
  perPerson: number | null;
  /** True when the discount has pushed margin to zero or below. */
  isLossMaking: boolean;
}

/**
 * Half-up rounding on an integer numerator/denominator pair.
 *
 * `Math.round` is not used directly on a product because the intermediate can
 * exceed the safe-integer range for large group bookings; this keeps the
 * multiply and divide adjacent and rounds once.
 */
function applyRate(amountPaise: number, bps: number): number {
  if (bps === 0 || amountPaise === 0) return 0;
  const product = amountPaise * bps;
  // Math.sign keeps a negative amount rounding away from zero symmetrically.
  return Math.trunc((product + Math.sign(product) * 5000) / 10000);
}

export function calculateCosting(input: CostingInput): CostingResult {
  const supplierCost = Math.max(0, Math.trunc(input.supplierCostPaise));
  const otherCost = Math.max(0, Math.trunc(input.otherCostPaise ?? 0));
  const baseCost = supplierCost + otherCost;

  const markupAmount =
    input.markupOverridePaise !== undefined && input.markupOverridePaise !== null
      ? Math.trunc(input.markupOverridePaise)
      : applyRate(baseCost, input.markupBps ?? 0);

  const grossBeforeDiscount = baseCost + markupAmount;

  const discountAmount =
    input.discountOverridePaise !== undefined && input.discountOverridePaise !== null
      ? Math.max(0, Math.trunc(input.discountOverridePaise))
      : applyRate(grossBeforeDiscount, input.discountBps ?? 0);

  const netBeforeTax = grossBeforeDiscount - discountAmount;
  const marginAmount = markupAmount - discountAmount;

  const basis: TaxBasis = input.taxBasis ?? 'GROSS';
  const gstBps = input.gstBps ?? 0;

  // Tax on a negative margin is nonsensical; clamp the base rather than
  // producing a credit the accounting system will not expect.
  const taxableValue =
    basis === 'EXEMPT' ? 0 : basis === 'MARGIN' ? Math.max(0, marginAmount) : Math.max(0, netBeforeTax);

  const gstAmount = applyRate(taxableValue, gstBps);
  const sellingPrice = netBeforeTax + gstAmount;

  // Margin as a proportion of the pre-tax price. Both operands are already
  // integers, so this is one divide with a single rounding step.
  const marginBps = netBeforeTax > 0 ? Math.round((marginAmount * 10000) / netBeforeTax) : 0;

  const travellers = Math.max(0, Math.trunc(input.travellerCount ?? 0));

  return {
    supplierCost,
    otherCost,
    baseCost,
    markupAmount,
    discountAmount,
    netBeforeTax,
    taxableValue,
    gstAmount,
    sellingPrice,
    marginAmount,
    marginBps,
    // Rounded up: a per-person figure that multiplies back to less than the
    // total would leave the booking short.
    perPerson: travellers > 0 ? Math.ceil(sellingPrice / travellers) : null,
    isLossMaking: marginAmount <= 0,
  };
}

/** Rolls package totals into a version total. */
export function sumCostings(results: CostingResult[]): Omit<CostingResult, 'perPerson' | 'isLossMaking'> {
  const zero = {
    supplierCost: 0,
    otherCost: 0,
    baseCost: 0,
    markupAmount: 0,
    discountAmount: 0,
    netBeforeTax: 0,
    taxableValue: 0,
    gstAmount: 0,
    sellingPrice: 0,
    marginAmount: 0,
    marginBps: 0,
  };

  const total = results.reduce(
    (acc, r) => ({
      supplierCost: acc.supplierCost + r.supplierCost,
      otherCost: acc.otherCost + r.otherCost,
      baseCost: acc.baseCost + r.baseCost,
      markupAmount: acc.markupAmount + r.markupAmount,
      discountAmount: acc.discountAmount + r.discountAmount,
      netBeforeTax: acc.netBeforeTax + r.netBeforeTax,
      taxableValue: acc.taxableValue + r.taxableValue,
      gstAmount: acc.gstAmount + r.gstAmount,
      sellingPrice: acc.sellingPrice + r.sellingPrice,
      marginAmount: acc.marginAmount + r.marginAmount,
      marginBps: 0,
    }),
    zero,
  );

  // Must round exactly as calculateCosting does: the same ratio has to yield
  // the same basis points whether it is one package or a rollup of several.
  total.marginBps =
    total.netBeforeTax > 0 ? Math.round((total.marginAmount * 10000) / total.netBeforeTax) : 0;

  return total;
}

/**
 * Whether a version needs manager approval before it can be sent.
 *
 * Thresholds are configuration, not constants — Lemuria sets them, and until
 * they do the caller passes whatever the settings table holds.
 */
export interface ApprovalRules {
  /** Quotes at or above this selling price need approval. */
  highValueThresholdPaise: number | null;
  /** Quotes at or below this margin need approval. */
  minimumMarginBps: number | null;
}

export type ApprovalTrigger = 'HIGH_VALUE' | 'LOW_MARGIN' | 'LOSS_MAKING';

export function approvalTriggers(
  totals: { sellingPrice: number; marginBps: number; marginAmount: number },
  rules: ApprovalRules,
): ApprovalTrigger[] {
  const triggers: ApprovalTrigger[] = [];

  // A quote that loses money always needs a second pair of eyes, whatever the
  // configured thresholds say.
  if (totals.marginAmount <= 0) triggers.push('LOSS_MAKING');

  if (rules.highValueThresholdPaise !== null && totals.sellingPrice >= rules.highValueThresholdPaise) {
    triggers.push('HIGH_VALUE');
  }
  if (
    rules.minimumMarginBps !== null &&
    totals.marginAmount > 0 &&
    totals.marginBps <= rules.minimumMarginBps
  ) {
    triggers.push('LOW_MARGIN');
  }

  return triggers;
}

/** Formats basis points for display: 1875 -> "18.75%". */
export function formatBps(bps: number): string {
  const sign = bps < 0 ? '-' : '';
  const abs = Math.abs(bps);
  const whole = Math.trunc(abs / 100);
  const frac = abs % 100;
  return frac === 0 ? `${sign}${whole}%` : `${sign}${whole}.${String(frac).padStart(2, '0')}%`;
}
