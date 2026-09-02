import { describe, expect, it } from 'vitest';
import { LEAD_STATUSES } from './enums.js';
import { allowedTransitions, canTransition } from './lead-status.js';

describe('lead status transitions', () => {
  it('allows a no-op transition to the same status', () => {
    for (const status of LEAD_STATUSES) expect(canTransition(status, status)).toBe(true);
  });

  it('does not let an OPEN lead jump straight to CONVERTED', () => {
    expect(canTransition('OPEN', 'CONVERTED')).toBe(false);
  });

  it('allows conversion once the lead is being worked', () => {
    expect(canTransition('IN_PROGRESS', 'CONVERTED')).toBe(true);
    expect(canTransition('QUOTATION_SENT', 'CONVERTED')).toBe(true);
  });

  it('treats CONVERTED as terminal', () => {
    expect(allowedTransitions('CONVERTED')).toHaveLength(0);
    for (const status of LEAD_STATUSES) {
      if (status === 'CONVERTED') continue;
      expect(canTransition('CONVERTED', status)).toBe(false);
    }
  });

  it('lets a LOST lead be revived but not converted directly', () => {
    expect(canTransition('LOST', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('LOST', 'CONVERTED')).toBe(false);
  });

  it('only ever names statuses that exist', () => {
    for (const status of LEAD_STATUSES) {
      for (const target of allowedTransitions(status)) {
        expect(LEAD_STATUSES).toContain(target);
      }
    }
  });
});
