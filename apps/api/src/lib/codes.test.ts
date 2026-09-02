import { describe, expect, it } from 'vitest';
import { maskIdNumber, normaliseName, normalisePhone } from './codes.js';

describe('normaliseName', () => {
  it('collapses case, punctuation and repeated whitespace', () => {
    expect(normaliseName('Ramesh   Iyer')).toBe('ramesh iyer');
    expect(normaliseName('RAMESH IYER')).toBe('ramesh iyer');
    expect(normaliseName('Ramesh  Iyer.')).toBe('ramesh iyer');
  });

  it('strips salutations so Dr. Ramesh matches Ramesh', () => {
    expect(normaliseName('Dr. Ramesh Iyer')).toBe('ramesh iyer');
    expect(normaliseName('Mrs Priya Sharma')).toBe('priya sharma');
  });

  it('folds accents rather than treating them as different people', () => {
    expect(normaliseName('José Fernández')).toBe('jose fernandez');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normaliseName('   ')).toBe('');
  });
});

describe('normalisePhone', () => {
  it('strips formatting', () => {
    expect(normalisePhone('+91 98765 43210')).toBe('9876543210');
    expect(normalisePhone('(98765) 43210')).toBe('9876543210');
    expect(normalisePhone('98765-43210')).toBe('9876543210');
  });

  it('drops the 91 country code only when a 10-digit number remains', () => {
    expect(normalisePhone('919876543210')).toBe('9876543210');
    // A genuine 10-digit number starting 91 must survive intact.
    expect(normalisePhone('9198765432')).toBe('9198765432');
  });

  it('strips leading zeros used for STD dialling', () => {
    expect(normalisePhone('09876543210')).toBe('9876543210');
  });

  it('makes every spelling of one number compare equal', () => {
    const forms = ['+91 98765 43210', '09876543210', '9876543210', '+919876543210'];
    const normalised = new Set(forms.map(normalisePhone));
    expect(normalised.size).toBe(1);
  });
});

describe('maskIdNumber', () => {
  it('reveals only the last four characters', () => {
    const masked = maskIdNumber('M1234567');
    expect(masked.endsWith('4567')).toBe(true);
    expect(masked).not.toContain('M123');
  });

  it('never leaks a short value', () => {
    expect(maskIdNumber('123')).toBe('•••');
    expect(maskIdNumber('1234')).toBe('••••');
  });
});
