import type { LeadStatus } from './enums.js';

/**
 * Allowed lead status transitions. Enforced in the backend service layer so a
 * lead cannot jump from OPEN straight to CONVERTED without a quotation trail.
 */
const TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  OPEN: ['IN_PROGRESS', 'QUOTATION_SENT', 'LOST', 'NO_RESPONSE'],
  IN_PROGRESS: ['QUOTATION_SENT', 'CONVERTED', 'LOST', 'NO_RESPONSE'],
  QUOTATION_SENT: ['IN_PROGRESS', 'CONVERTED', 'LOST', 'NO_RESPONSE'],
  NO_RESPONSE: ['IN_PROGRESS', 'QUOTATION_SENT', 'LOST'],
  CONVERTED: [],
  LOST: ['IN_PROGRESS'],
};

export function canTransition(from: LeadStatus, to: LeadStatus): boolean {
  if (from === to) return true;
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function allowedTransitions(from: LeadStatus): readonly LeadStatus[] {
  return TRANSITIONS[from] ?? [];
}

/** Funnel stages for the dashboard conversion chart (spec §7). */
export const FUNNEL_STAGES = [
  { key: 'LEADS', label: 'Leads' },
  { key: 'QUALIFIED', label: 'Qualified' },
  { key: 'QUOTATION_SENT', label: 'Quotation Sent' },
  { key: 'FOLLOWUP', label: 'Follow-up' },
  { key: 'BOOKING_CONFIRMED', label: 'Booking Confirmed' },
] as const;

export type FunnelStageKey = (typeof FUNNEL_STAGES)[number]['key'];
