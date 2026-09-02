import { describe, expect, it } from 'vitest';
import { formatMoney, formatMoneyCompact, formatPhone, isOverdue } from './format';

describe('formatMoney', () => {
  it('converts paise to rupees without float drift', () => {
    expect(formatMoney(10_000_00)).toContain('10,000');
    expect(formatMoney(1_50_000_00)).toContain('1,50,000');
  });

  it('renders an em dash for missing values instead of NaN or zero', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
  });

  it('treats a genuine zero as zero, not as missing', () => {
    expect(formatMoney(0)).not.toBe('—');
    expect(formatMoney(0)).toContain('0');
  });
});

describe('formatMoneyCompact', () => {
  it('uses the Indian lakh and crore scale', () => {
    expect(formatMoneyCompact(1_00_000_00)).toBe('₹1.00L');
    expect(formatMoneyCompact(1_00_00_000_00)).toBe('₹1.00Cr');
    expect(formatMoneyCompact(5_000_00)).toBe('₹5.0K');
  });

  it('handles negatives without losing the scale', () => {
    expect(formatMoneyCompact(-1_00_000_00)).toContain('L');
  });
});

describe('formatPhone', () => {
  it('groups an Indian mobile as 5 + 5', () => {
    expect(formatPhone('9876543210')).toBe('98765 43210');
  });

  it('falls back to the raw value when it is not 10 digits', () => {
    expect(formatPhone('123')).toBe('123');
  });

  it('renders an em dash when absent', () => {
    expect(formatPhone(null)).toBe('—');
  });
});

describe('isOverdue', () => {
  it('is false for a missing or unparseable date', () => {
    expect(isOverdue(null)).toBe(false);
    expect(isOverdue('nonsense')).toBe(false);
  });

  it('detects past and future correctly', () => {
    expect(isOverdue(new Date(Date.now() - 60_000))).toBe(true);
    expect(isOverdue(new Date(Date.now() + 60_000))).toBe(false);
  });
});
