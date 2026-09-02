import type { LeadClassification } from '@lemuria/shared';

/**
 * Deterministic lead scoring.
 *
 * The score is rule-based rather than model-generated on purpose: a travel
 * executive has to be able to answer "why is this Hot?" to a manager, and the
 * same lead must score the same way twice. The AI layer may later *suggest* an
 * adjustment, but it is recorded as a separate, overridable signal — the model
 * never silently sets the number the sales floor works from (spec §13, §60).
 */

export interface ScoringSignals {
  /** Days until travel. Negative means the date has already passed. */
  daysToTravel: number | null;
  budgetAmount: number | null;
  travellerCount: number;
  /** Weight configured on the lead source, 0-100. */
  sourceWeight: number;
  hasEmail: boolean;
  hasDestination: boolean;
  /** Prior confirmed bookings by this customer. */
  previousBookings: number;
  /** Hours since the enquiry arrived. */
  ageHours: number;
  /** Inbound + outbound messages exchanged so far. */
  interactionCount: number;
}

export interface ScoreResult {
  score: number;
  classification: LeadClassification;
  reason: string;
  factors: Record<string, number>;
}

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/** Travel imminence — a trip 3 weeks out is far more actionable than one a year out. */
function urgencyPoints(daysToTravel: number | null): number {
  if (daysToTravel === null) return 6;
  if (daysToTravel < 0) return 0;
  if (daysToTravel <= 14) return 25;
  if (daysToTravel <= 30) return 22;
  if (daysToTravel <= 60) return 18;
  if (daysToTravel <= 120) return 12;
  if (daysToTravel <= 240) return 7;
  return 4;
}

/** Budget in paise. Thresholds are tuned to Lemuria's typical ticket sizes. */
function budgetPoints(budgetAmount: number | null): number {
  if (budgetAmount === null || budgetAmount <= 0) return 5;
  const rupees = budgetAmount / 100;
  if (rupees >= 500_000) return 25;
  if (rupees >= 250_000) return 22;
  if (rupees >= 100_000) return 18;
  if (rupees >= 50_000) return 13;
  if (rupees >= 25_000) return 9;
  return 5;
}

/** A lead nobody has touched in three days is going cold regardless of its size. */
function recencyPoints(ageHours: number, interactionCount: number): number {
  if (interactionCount > 0) return clamp(10 + interactionCount * 2, 10, 15);
  if (ageHours <= 24) return 12;
  if (ageHours <= 72) return 8;
  if (ageHours <= 168) return 4;
  return 0;
}

export function scoreLead(signals: ScoringSignals): ScoreResult {
  const factors: Record<string, number> = {
    urgency: urgencyPoints(signals.daysToTravel),
    budget: budgetPoints(signals.budgetAmount),
    source: Math.round((clamp(signals.sourceWeight, 0, 100) / 100) * 15),
    engagement: recencyPoints(signals.ageHours, signals.interactionCount),
    groupSize: clamp(signals.travellerCount, 1, 10) >= 4 ? 8 : signals.travellerCount >= 2 ? 5 : 2,
    loyalty: signals.previousBookings > 0 ? clamp(5 + signals.previousBookings * 3, 5, 12) : 0,
    completeness: (signals.hasEmail ? 3 : 0) + (signals.hasDestination ? 2 : 0),
  };

  const score = clamp(
    Object.values(factors).reduce((sum, n) => sum + n, 0),
    0,
    100,
  );

  const classification: LeadClassification = score >= 70 ? 'HOT' : score >= 40 ? 'WARM' : 'COLD';

  // Name the two strongest contributors so the UI can show a one-line rationale.
  const top = Object.entries(factors)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .filter(([, v]) => v > 0)
    .map(([k]) => k);

  const LABELS: Record<string, string> = {
    urgency: 'travel date is near',
    budget: 'strong budget',
    source: 'high-intent source',
    engagement: 'recent engagement',
    groupSize: 'larger travelling group',
    loyalty: 'repeat customer',
    completeness: 'complete enquiry details',
  };

  const reason =
    top.length > 0
      ? `Scored ${score} — ${top.map((k) => LABELS[k] ?? k).join(' and ')}.`
      : `Scored ${score} — limited signal available.`;

  return { score, classification, reason, factors };
}

/** Hours between an enquiry timestamp and now, floored at zero. */
export function ageHours(createdAt: Date, now = new Date()): number {
  return Math.max(0, (now.getTime() - createdAt.getTime()) / 3_600_000);
}

/** Whole days from today to a travel date, or null when no date was captured. */
export function daysUntil(travelDate: string | null, now = new Date()): number | null {
  if (!travelDate) return null;
  const target = new Date(`${travelDate}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target.getTime() - today) / 86_400_000);
}
