import { sql } from 'drizzle-orm';
import type { Db, Transaction } from '../db/client.js';
import { codeSequences } from '../db/schema/system.js';

export type CodeScope =
  | 'LEAD'
  | 'CUSTOMER'
  | 'QUOTATION'
  | 'ITINERARY'
  | 'VISA'
  | 'PASSPORT'
  | 'BOOKING'
  | 'PAYMENT'
  | 'DOCUMENT'
  | 'SUPPLIER';

const PREFIX: Record<CodeScope, string> = {
  LEAD: 'LM-L',
  CUSTOMER: 'LM-C',
  QUOTATION: 'LM-Q',
  ITINERARY: 'LM-I',
  VISA: 'LM-V',
  PASSPORT: 'LM-P',
  BOOKING: 'LM-B',
  PAYMENT: 'LM-PAY',
  DOCUMENT: 'LM-D',
  SUPPLIER: 'LM-S',
};

const PAD: Record<CodeScope, number> = {
  LEAD: 6,
  CUSTOMER: 5,
  QUOTATION: 5,
  ITINERARY: 5,
  VISA: 5,
  PASSPORT: 5,
  BOOKING: 5,
  PAYMENT: 6,
  DOCUMENT: 6,
  SUPPLIER: 4,
};

/**
 * Allocates the next human-readable code for a scope, e.g. LM-L-2026-000123.
 *
 * The counter is bumped with a single atomic upsert rather than read-then-write,
 * so two executives filing an enquiry at the same instant cannot be handed the
 * same lead code. Must run inside the same transaction as the insert it names.
 */
export async function nextCode(
  tx: Db | Transaction,
  scope: CodeScope,
  year = new Date().getUTCFullYear(),
): Promise<string> {
  const [row] = await tx
    .insert(codeSequences)
    .values({ scope, year, lastValue: 1 })
    .onConflictDoUpdate({
      target: [codeSequences.scope, codeSequences.year],
      set: { lastValue: sql`${codeSequences.lastValue} + 1` },
    })
    .returning({ lastValue: codeSequences.lastValue });

  if (!row) throw new Error(`Failed to allocate a ${scope} code`);
  return `${PREFIX[scope]}-${year}-${String(row.lastValue).padStart(PAD[scope], '0')}`;
}

/**
 * Normalises a name for duplicate matching: lowercased, accent-folded, with
 * punctuation and repeated whitespace removed. "Dr. Ramesh  Iyer" and
 * "ramesh iyer" both collapse to "ramesh iyer".
 */
export function normaliseName(input: string): string {
  return input
    .normalize('NFKD')
    // Strip combining diacritical marks left behind by NFKD decomposition.
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|dr|prof|shri|smt)\.?\s+/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strips formatting and the +91 country code so phone comparison is stable. */
export function normalisePhone(input: string): string {
  return input.replace(/[^\d]/g, '').replace(/^0+/, '').replace(/^91(?=\d{10}$)/, '');
}

/** Shows only the last four characters, e.g. "••••••1234". */
export function maskIdNumber(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return '•'.repeat(trimmed.length);
  return '•'.repeat(Math.min(6, trimmed.length - 4)) + trimmed.slice(-4);
}
