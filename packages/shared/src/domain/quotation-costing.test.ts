import { describe, expect, it } from 'vitest';
import {
  approvalTriggers,
  calculateCosting,
  formatBps,
  sumCostings,
  type CostingInput,
} from './quotation-costing.js';

/** ₹ to paise, so the tests read in the units a human would state them in. */
const rs = (rupees: number) => Math.round(rupees * 100);

describe('calculateCosting', () => {
  it('applies cost, markup and tax in order', () => {
    const r = calculateCosting({
      supplierCostPaise: rs(100_000),
      markupBps: 1500, // 15%
      gstBps: 500, // 5%
      taxBasis: 'GROSS',
    });

    expect(r.baseCost).toBe(rs(100_000));
    expect(r.markupAmount).toBe(rs(15_000));
    expect(r.netBeforeTax).toBe(rs(115_000));
    expect(r.gstAmount).toBe(rs(5_750));
    expect(r.sellingPrice).toBe(rs(120_750));
    expect(r.marginAmount).toBe(rs(15_000));
  });

  it('reports margin against the pre-tax price, not the cost', () => {
    const r = calculateCosting({ supplierCostPaise: rs(100_000), markupBps: 1500 });
    // 15,000 / 115,000 = 13.04%
    expect(r.marginBps).toBe(1304);
  });

  it('includes other costs in the markup base', () => {
    const r = calculateCosting({
      supplierCostPaise: rs(80_000),
      otherCostPaise: rs(20_000),
      markupBps: 1000,
    });
    expect(r.baseCost).toBe(rs(100_000));
    expect(r.markupAmount).toBe(rs(10_000));
  });

  it('never loses or invents money — components always sum to the total', () => {
    const cases: CostingInput[] = [
      { supplierCostPaise: 333_33, markupBps: 1234, gstBps: 500 },
      { supplierCostPaise: 999_99, markupBps: 777, discountBps: 333, gstBps: 1800 },
      { supplierCostPaise: 1, markupBps: 1, gstBps: 1 },
      { supplierCostPaise: rs(1_234_567), markupBps: 1875, discountBps: 250, gstBps: 500 },
    ];

    for (const input of cases) {
      const r = calculateCosting(input);
      expect(r.baseCost).toBe(r.supplierCost + r.otherCost);
      expect(r.netBeforeTax).toBe(r.baseCost + r.markupAmount - r.discountAmount);
      expect(r.sellingPrice).toBe(r.netBeforeTax + r.gstAmount);
      expect(r.marginAmount).toBe(r.markupAmount - r.discountAmount);
      // Every figure stays an exact integer number of paise.
      for (const value of Object.values(r)) {
        if (typeof value === 'number') expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  describe('tax basis', () => {
    const base = { supplierCostPaise: rs(100_000), markupBps: 2000, gstBps: 500 } as const;

    it('GROSS taxes the whole pre-tax price', () => {
      const r = calculateCosting({ ...base, taxBasis: 'GROSS' });
      expect(r.taxableValue).toBe(rs(120_000));
      expect(r.gstAmount).toBe(rs(6_000));
    });

    it('MARGIN taxes only what Lemuria keeps', () => {
      const r = calculateCosting({ ...base, taxBasis: 'MARGIN' });
      expect(r.taxableValue).toBe(rs(20_000));
      expect(r.gstAmount).toBe(rs(1_000));
    });

    it('EXEMPT charges nothing', () => {
      const r = calculateCosting({ ...base, taxBasis: 'EXEMPT' });
      expect(r.taxableValue).toBe(0);
      expect(r.gstAmount).toBe(0);
      expect(r.sellingPrice).toBe(r.netBeforeTax);
    });

    it('does not charge tax on a negative margin under the MARGIN basis', () => {
      const r = calculateCosting({
        supplierCostPaise: rs(100_000),
        markupBps: 500,
        discountOverridePaise: rs(20_000),
        gstBps: 500,
        taxBasis: 'MARGIN',
      });
      expect(r.marginAmount).toBeLessThan(0);
      expect(r.taxableValue).toBe(0);
      expect(r.gstAmount).toBe(0);
    });
  });

  describe('discounts', () => {
    it('applies a percentage discount to the marked-up price', () => {
      const r = calculateCosting({
        supplierCostPaise: rs(100_000),
        markupBps: 2000,
        discountBps: 1000, // 10% off 120,000
      });
      expect(r.discountAmount).toBe(rs(12_000));
      expect(r.netBeforeTax).toBe(rs(108_000));
      expect(r.marginAmount).toBe(rs(8_000));
    });

    it('lets a flat discount override the percentage', () => {
      const r = calculateCosting({
        supplierCostPaise: rs(100_000),
        markupBps: 2000,
        discountBps: 1000,
        discountOverridePaise: rs(5_000),
      });
      expect(r.discountAmount).toBe(rs(5_000));
    });

    it('flags a discount that wipes out the margin', () => {
      const r = calculateCosting({
        supplierCostPaise: rs(100_000),
        markupBps: 1000,
        discountOverridePaise: rs(15_000),
      });
      expect(r.isLossMaking).toBe(true);
      expect(r.marginAmount).toBeLessThan(0);
      expect(r.marginBps).toBeLessThan(0);
    });

    it('treats an exactly-zero margin as loss-making — it is not worth selling', () => {
      const r = calculateCosting({
        supplierCostPaise: rs(100_000),
        markupBps: 1000,
        discountOverridePaise: rs(10_000),
      });
      expect(r.marginAmount).toBe(0);
      expect(r.isLossMaking).toBe(true);
    });
  });

  describe('per-person price', () => {
    it('rounds up so the parts never total less than the whole', () => {
      const r = calculateCosting({ supplierCostPaise: 100_00, travellerCount: 3 });
      // 10000 paise / 3 = 3333.33 -> 3334, so 3 x 3334 >= 10000
      expect(r.perPerson).toBe(3334);
      expect(r.perPerson! * 3).toBeGreaterThanOrEqual(r.sellingPrice);
    });

    it('is null when no traveller count is given', () => {
      expect(calculateCosting({ supplierCostPaise: rs(1000) }).perPerson).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles a zero-cost quotation without dividing by zero', () => {
      const r = calculateCosting({ supplierCostPaise: 0, markupBps: 1500, gstBps: 500 });
      expect(r.sellingPrice).toBe(0);
      expect(r.marginBps).toBe(0);
    });

    it('clamps a negative supplier cost rather than propagating it', () => {
      expect(calculateCosting({ supplierCostPaise: -5000 }).supplierCost).toBe(0);
    });

    it('lets a flat markup override the percentage', () => {
      const r = calculateCosting({
        supplierCostPaise: rs(100_000),
        markupBps: 1500,
        markupOverridePaise: rs(25_000),
      });
      expect(r.markupAmount).toBe(rs(25_000));
    });

    it('stays exact on a large group booking beyond the 32-bit range', () => {
      const r = calculateCosting({
        supplierCostPaise: rs(50_000_000), // ₹5 crore
        markupBps: 1200,
        gstBps: 500,
      });
      expect(r.markupAmount).toBe(rs(6_000_000));
      expect(r.sellingPrice).toBe(r.netBeforeTax + r.gstAmount);
      expect(Number.isSafeInteger(r.sellingPrice)).toBe(true);
    });

    it('is deterministic', () => {
      const input: CostingInput = {
        supplierCostPaise: 777_77,
        markupBps: 1333,
        discountBps: 111,
        gstBps: 500,
      };
      expect(calculateCosting(input)).toEqual(calculateCosting(input));
    });
  });
});

describe('sumCostings', () => {
  it('adds packages without drifting', () => {
    const a = calculateCosting({ supplierCostPaise: rs(50_000), markupBps: 1500, gstBps: 500 });
    const b = calculateCosting({ supplierCostPaise: rs(30_000), markupBps: 1000, gstBps: 500 });
    const total = sumCostings([a, b]);

    expect(total.supplierCost).toBe(rs(80_000));
    expect(total.sellingPrice).toBe(a.sellingPrice + b.sellingPrice);
    expect(total.netBeforeTax).toBe(total.baseCost + total.markupAmount - total.discountAmount);
  });

  it('returns zeroes for no packages', () => {
    const total = sumCostings([]);
    expect(total.sellingPrice).toBe(0);
    expect(total.marginBps).toBe(0);
  });

  it('recomputes blended margin rather than averaging the parts', () => {
    const rich = calculateCosting({ supplierCostPaise: rs(10_000), markupBps: 5000 });
    const thin = calculateCosting({ supplierCostPaise: rs(90_000), markupBps: 200 });
    const total = sumCostings([rich, thin]);
    // A naive average of 33.3% and 1.96% would be ~17.6%; the true blended
    // figure is weighted by value and much lower.
    expect(total.marginBps).toBeLessThan(1000);
    expect(total.marginBps).toBe(
      Math.round((total.marginAmount * 10000) / total.netBeforeTax),
    );
  });
});

describe('approvalTriggers', () => {
  const rules = { highValueThresholdPaise: rs(500_000), minimumMarginBps: 1000 };

  it('passes an ordinary quote', () => {
    expect(
      approvalTriggers({ sellingPrice: rs(100_000), marginBps: 1500, marginAmount: rs(15_000) }, rules),
    ).toEqual([]);
  });

  it('flags a high-value quote', () => {
    expect(
      approvalTriggers({ sellingPrice: rs(600_000), marginBps: 1500, marginAmount: rs(90_000) }, rules),
    ).toContain('HIGH_VALUE');
  });

  it('flags a thin margin', () => {
    expect(
      approvalTriggers({ sellingPrice: rs(100_000), marginBps: 800, marginAmount: rs(8_000) }, rules),
    ).toContain('LOW_MARGIN');
  });

  it('always flags a loss, whatever the thresholds say', () => {
    const noRules = { highValueThresholdPaise: null, minimumMarginBps: null };
    expect(
      approvalTriggers({ sellingPrice: rs(100_000), marginBps: -500, marginAmount: rs(-5_000) }, noRules),
    ).toEqual(['LOSS_MAKING']);
  });

  it('does not double-report a loss as a thin margin', () => {
    const triggers = approvalTriggers(
      { sellingPrice: rs(100_000), marginBps: -500, marginAmount: rs(-5_000) },
      rules,
    );
    expect(triggers).toContain('LOSS_MAKING');
    expect(triggers).not.toContain('LOW_MARGIN');
  });

  it('requires nothing when thresholds are unset and the quote is profitable', () => {
    expect(
      approvalTriggers(
        { sellingPrice: rs(10_000_000), marginBps: 100, marginAmount: rs(10_000) },
        { highValueThresholdPaise: null, minimumMarginBps: null },
      ),
    ).toEqual([]);
  });
});

describe('formatBps', () => {
  it('renders whole and fractional percentages', () => {
    expect(formatBps(1500)).toBe('15%');
    expect(formatBps(1875)).toBe('18.75%');
    expect(formatBps(500)).toBe('5%');
    expect(formatBps(5)).toBe('0.05%');
    expect(formatBps(0)).toBe('0%');
  });

  it('keeps the sign on a negative margin', () => {
    expect(formatBps(-250)).toBe('-2.50%');
  });
});
