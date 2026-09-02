import { describe, expect, it } from 'vitest';
import { ageHours, daysUntil, scoreLead, type ScoringSignals } from './scoring.service.js';

const base: ScoringSignals = {
  daysToTravel: 90,
  budgetAmount: 100_000_00, // ₹1,00,000 in paise
  travellerCount: 2,
  sourceWeight: 50,
  hasEmail: true,
  hasDestination: true,
  previousBookings: 0,
  ageHours: 2,
  interactionCount: 0,
};

describe('scoreLead', () => {
  it('keeps the score inside 0-100 for extreme inputs', () => {
    const max = scoreLead({
      daysToTravel: 7,
      budgetAmount: 10_000_000_00,
      travellerCount: 12,
      sourceWeight: 100,
      hasEmail: true,
      hasDestination: true,
      previousBookings: 20,
      ageHours: 0,
      interactionCount: 50,
    });
    const min = scoreLead({
      daysToTravel: -30,
      budgetAmount: 0,
      travellerCount: 1,
      sourceWeight: 0,
      hasEmail: false,
      hasDestination: false,
      previousBookings: 0,
      ageHours: 5000,
      interactionCount: 0,
    });

    expect(max.score).toBeLessThanOrEqual(100);
    expect(min.score).toBeGreaterThanOrEqual(0);
  });

  it('classifies on the documented thresholds', () => {
    expect(scoreLead({ ...base, sourceWeight: 0, budgetAmount: 0, daysToTravel: 400, hasEmail: false, hasDestination: false }).classification).toBe('COLD');
    expect(scoreLead(base).classification).toBe('WARM');
    expect(
      scoreLead({
        ...base,
        daysToTravel: 10,
        budgetAmount: 600_000_00,
        sourceWeight: 95,
        travellerCount: 5,
        previousBookings: 3,
        interactionCount: 3,
      }).classification,
    ).toBe('HOT');
  });

  it('scores an imminent trip above a distant one, all else equal', () => {
    const soon = scoreLead({ ...base, daysToTravel: 10 });
    const later = scoreLead({ ...base, daysToTravel: 300 });
    expect(soon.score).toBeGreaterThan(later.score);
  });

  it('scores a larger budget above a smaller one, all else equal', () => {
    const rich = scoreLead({ ...base, budgetAmount: 500_000_00 });
    const modest = scoreLead({ ...base, budgetAmount: 20_000_00 });
    expect(rich.score).toBeGreaterThan(modest.score);
  });

  it('rewards a repeat customer', () => {
    expect(scoreLead({ ...base, previousBookings: 4 }).score).toBeGreaterThan(scoreLead(base).score);
  });

  it('does not reward a travel date that has already passed', () => {
    const past = scoreLead({ ...base, daysToTravel: -5 });
    expect(past.factors.urgency).toBe(0);
  });

  it('is deterministic — the same signals always score the same', () => {
    expect(scoreLead(base)).toEqual(scoreLead(base));
  });

  it('explains itself with a human-readable reason', () => {
    const result = scoreLead({ ...base, daysToTravel: 10, budgetAmount: 600_000_00 });
    expect(result.reason).toMatch(/^Scored \d+/);
    expect(result.reason.length).toBeGreaterThan(12);
  });

  it('treats a missing travel date as weak signal, not as urgent', () => {
    const unknown = scoreLead({ ...base, daysToTravel: null });
    const imminent = scoreLead({ ...base, daysToTravel: 7 });
    expect(unknown.factors.urgency).toBeLessThan(imminent.factors.urgency!);
  });
});

describe('daysUntil', () => {
  it('returns null when no date is captured', () => {
    expect(daysUntil(null)).toBeNull();
  });

  it('returns null for an unparseable date rather than NaN', () => {
    expect(daysUntil('not-a-date')).toBeNull();
  });

  it('counts whole days forward', () => {
    const now = new Date('2026-09-02T12:00:00Z');
    expect(daysUntil('2026-09-12', now)).toBe(10);
  });

  it('goes negative for a date in the past', () => {
    const now = new Date('2026-09-02T12:00:00Z');
    expect(daysUntil('2026-08-30', now)).toBe(-3);
  });
});

describe('ageHours', () => {
  it('never returns a negative age for a clock skew', () => {
    const future = new Date(Date.now() + 60_000);
    expect(ageHours(future)).toBe(0);
  });

  it('measures elapsed hours', () => {
    const now = new Date('2026-09-02T12:00:00Z');
    expect(ageHours(new Date('2026-09-02T06:00:00Z'), now)).toBe(6);
  });
});
