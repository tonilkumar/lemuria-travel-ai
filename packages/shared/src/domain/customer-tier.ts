import type { CustomerTier } from './enums.js';

/**
 * Relationship tier and score, derived from booking history and lifetime value.
 *
 * This lives in the shared domain rather than the service layer because it is a
 * business rule with no database in it: the same inputs must produce the same
 * tier wherever it is asked, and the frontend needs to be able to explain the
 * thresholds without a round trip.
 *
 * A customer qualifies on EITHER count or value — a first-time client who books
 * a ₹15L multi-family tour is not a Bronze customer just because it is their
 * first trip.
 */
export interface StandingInput {
  /** Confirmed, non-cancelled bookings. */
  totalBookings: number;
  /** Sum of payments received, in paise. */
  lifetimeValuePaise: number;
}

export interface Standing {
  tier: CustomerTier;
  /** 0-100, used for sorting and for the badge. */
  score: number;
}

const LAKH_IN_PAISE = 100_000 * 100;

export function customerStanding({ totalBookings, lifetimeValuePaise }: StandingInput): Standing {
  const bookings = Math.max(0, totalBookings);
  const lakhs = Math.max(0, lifetimeValuePaise) / LAKH_IN_PAISE;

  const score = Math.min(100, Math.round(bookings * 12 + lakhs * 8));

  const tier: CustomerTier =
    bookings >= 5 || lakhs >= 15
      ? 'PLATINUM'
      : bookings >= 3 || lakhs >= 7
        ? 'GOLD'
        : bookings >= 1
          ? 'SILVER'
          : 'BRONZE';

  return { tier, score };
}

/** Thresholds, so the UI can explain a tier without hardcoding the numbers. */
export const TIER_THRESHOLDS = [
  { tier: 'PLATINUM', minBookings: 5, minLakhs: 15 },
  { tier: 'GOLD', minBookings: 3, minLakhs: 7 },
  { tier: 'SILVER', minBookings: 1, minLakhs: 0 },
  { tier: 'BRONZE', minBookings: 0, minLakhs: 0 },
] as const;
