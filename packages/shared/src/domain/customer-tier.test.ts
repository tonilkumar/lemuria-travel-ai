import { describe, expect, it } from 'vitest';
import { customerStanding } from './customer-tier.js';

const lakhs = (n: number) => n * 100_000 * 100; // rupees -> paise

describe('customerStanding', () => {
  it('starts a new customer at Bronze', () => {
    expect(customerStanding({ totalBookings: 0, lifetimeValuePaise: 0 })).toEqual({
      tier: 'BRONZE',
      score: 0,
    });
  });

  it('promotes to Silver on the first booking', () => {
    expect(customerStanding({ totalBookings: 1, lifetimeValuePaise: lakhs(1) }).tier).toBe('SILVER');
  });

  it('promotes on booking count', () => {
    expect(customerStanding({ totalBookings: 3, lifetimeValuePaise: 0 }).tier).toBe('GOLD');
    expect(customerStanding({ totalBookings: 5, lifetimeValuePaise: 0 }).tier).toBe('PLATINUM');
  });

  it('promotes on value alone — a first big booking is not a Bronze customer', () => {
    expect(customerStanding({ totalBookings: 1, lifetimeValuePaise: lakhs(16) }).tier).toBe('PLATINUM');
    expect(customerStanding({ totalBookings: 1, lifetimeValuePaise: lakhs(8) }).tier).toBe('GOLD');
  });

  it('caps the score at 100', () => {
    expect(customerStanding({ totalBookings: 40, lifetimeValuePaise: lakhs(500) }).score).toBe(100);
  });

  it('never returns a negative score for corrupt inputs', () => {
    const result = customerStanding({ totalBookings: -3, lifetimeValuePaise: -500 });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.tier).toBe('BRONZE');
  });

  it('is monotonic — more bookings never lowers the score', () => {
    let previous = -1;
    for (let n = 0; n <= 10; n++) {
      const { score } = customerStanding({ totalBookings: n, lifetimeValuePaise: 0 });
      expect(score).toBeGreaterThanOrEqual(previous);
      previous = score;
    }
  });

  it('is deterministic', () => {
    const input = { totalBookings: 4, lifetimeValuePaise: lakhs(9) };
    expect(customerStanding(input)).toEqual(customerStanding(input));
  });
});
