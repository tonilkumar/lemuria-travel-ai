import { describe, expect, it } from 'vitest';
import { QUOTATION_STATUSES } from '../domain/enums.js';
import {
  canTransitionQuotation,
  isVersionEditable,
  PASS_THROUGH_CATEGORIES,
  SERVICE_CATEGORIES,
  upsertPackageSchema,
} from './quotations.js';

describe('quotation version transitions', () => {
  it('allows a no-op', () => {
    for (const status of QUOTATION_STATUSES) {
      expect(canTransitionQuotation(status, status)).toBe(true);
    }
  });

  it('lets a clean draft go straight to approved or sent', () => {
    expect(canTransitionQuotation('DRAFT', 'APPROVED')).toBe(true);
    expect(canTransitionQuotation('DRAFT', 'SENT')).toBe(true);
  });

  it('will not let a pending version be sent without a decision', () => {
    expect(canTransitionQuotation('PENDING_APPROVAL', 'SENT')).toBe(false);
  });

  it('sends a rejected version back to draft, not onward', () => {
    expect(canTransitionQuotation('REJECTED', 'DRAFT')).toBe(true);
    expect(canTransitionQuotation('REJECTED', 'APPROVED')).toBe(false);
    expect(canTransitionQuotation('REJECTED', 'SENT')).toBe(false);
  });

  it('treats a customer decision as final', () => {
    // A no-op is always legal, so each terminal state skips only itself.
    for (const terminal of ['ACCEPTED', 'DECLINED', 'EXPIRED'] as const) {
      for (const target of QUOTATION_STATUSES) {
        if (target === terminal) continue;
        expect(canTransitionQuotation(terminal, target)).toBe(false);
      }
    }
  });

  it('only lets a sent version record an outcome', () => {
    expect(canTransitionQuotation('SENT', 'ACCEPTED')).toBe(true);
    expect(canTransitionQuotation('SENT', 'DECLINED')).toBe(true);
    expect(canTransitionQuotation('SENT', 'EXPIRED')).toBe(true);
    // Re-pricing a sent quote means a new version, not editing this one.
    expect(canTransitionQuotation('SENT', 'DRAFT')).toBe(false);
  });
});

describe('isVersionEditable', () => {
  it('permits editing only before the customer has seen it', () => {
    expect(isVersionEditable('DRAFT')).toBe(true);
    expect(isVersionEditable('REJECTED')).toBe(true);
  });

  it('freezes everything from approval onward', () => {
    for (const status of ['PENDING_APPROVAL', 'APPROVED', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED']) {
      expect(isVersionEditable(status)).toBe(false);
    }
  });
});

describe('service categories', () => {
  it('marks statutory fees as pass-through so they are never marked up', () => {
    expect(PASS_THROUGH_CATEGORIES).toContain('VISA');
    expect(PASS_THROUGH_CATEGORIES).toContain('PERMIT');
    expect(PASS_THROUGH_CATEGORIES).toContain('INSURANCE');
  });

  it('does not mark ordinary services as pass-through', () => {
    expect(PASS_THROUGH_CATEGORIES).not.toContain('HOTEL');
    expect(PASS_THROUGH_CATEGORIES).not.toContain('FLIGHT');
  });

  it('only names categories that exist', () => {
    for (const category of PASS_THROUGH_CATEGORIES) {
      expect(SERVICE_CATEGORIES).toContain(category);
    }
  });
});

describe('upsertPackageSchema', () => {
  const base = { name: 'Gold', items: [] };

  it('accepts a package with no discount and no reason', () => {
    expect(upsertPackageSchema.safeParse(base).success).toBe(true);
  });

  it('refuses a percentage discount with no reason on the record', () => {
    const result = upsertPackageSchema.safeParse({ ...base, discountBps: 500 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/why a discount/i);
    }
  });

  it('refuses a flat discount with no reason either', () => {
    expect(upsertPackageSchema.safeParse({ ...base, discountOverride: 5000 }).success).toBe(false);
  });

  it('accepts a discount once a reason is given', () => {
    expect(
      upsertPackageSchema.safeParse({
        ...base,
        discountBps: 500,
        discountReason: 'Repeat customer',
      }).success,
    ).toBe(true);
  });

  it('rejects a markup beyond the sane ceiling', () => {
    expect(upsertPackageSchema.safeParse({ ...base, markupBps: 999_999 }).success).toBe(false);
  });

  it('rejects a discount over 100%', () => {
    expect(
      upsertPackageSchema.safeParse({
        ...base,
        discountBps: 10_001,
        discountReason: 'x',
      }).success,
    ).toBe(false);
  });
});
