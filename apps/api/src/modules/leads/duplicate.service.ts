import type { DuplicateCandidate } from '@lemuria/shared';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { customers } from '../../db/schema/customers.js';
import { leads } from '../../db/schema/leads.js';
import { normaliseName, normalisePhone } from '../../lib/codes.js';

/**
 * Finds records that may already represent this person.
 *
 * The result is advisory only — it is shown to the executive, who chooses to
 * open the existing record, attach to it, or create a new one anyway. Nothing
 * here merges or overwrites automatically (spec §12).
 */
export interface DuplicateQuery {
  name: string;
  phone: string;
  email?: string | undefined;
  /** Omit this lead from the results when re-checking an existing record. */
  excludeLeadId?: string;
}

export async function findDuplicates(input: DuplicateQuery): Promise<DuplicateCandidate[]> {
  const phone = normalisePhone(input.phone);
  const email = input.email?.trim().toLowerCase();
  const name = normaliseName(input.name);

  const customerMatches = await db
    .select({
      id: customers.id,
      customerCode: customers.customerCode,
      fullName: customers.fullName,
      phone: customers.primaryPhone,
      email: customers.email,
      nameNormalised: customers.nameNormalised,
      lastActivityAt: customers.lastActivityAt,
    })
    .from(customers)
    .where(
      and(
        isNull(customers.deletedAt),
        or(
          eq(customers.primaryPhone, phone),
          eq(customers.alternatePhone, phone),
          email ? eq(customers.email, email) : sql`false`,
          eq(customers.nameNormalised, name),
        ),
      ),
    )
    .limit(10);

  const leadMatches = await db
    .select({
      id: leads.id,
      leadCode: leads.leadCode,
      customerId: leads.customerId,
      customerName: leads.customerName,
      phone: leads.phone,
      email: leads.email,
      nameNormalised: leads.nameNormalised,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .where(
      and(
        isNull(leads.deletedAt),
        // An already-converted lead is represented by its customer row instead.
        isNull(leads.convertedAt),
        input.excludeLeadId ? sql`${leads.id} <> ${input.excludeLeadId}` : sql`true`,
        or(
          eq(leads.phone, phone),
          email ? eq(leads.email, email) : sql`false`,
          eq(leads.nameNormalised, name),
        ),
      ),
    )
    .limit(10);

  const out: DuplicateCandidate[] = [];

  for (const c of customerMatches) {
    const matchedOn = matchReasons(
      { phone: c.phone, email: c.email, nameNormalised: c.nameNormalised },
      { phone, email, name },
    );
    if (matchedOn.length === 0) continue;
    out.push({
      customerId: c.id,
      leadId: null,
      customerCode: c.customerCode,
      name: c.fullName,
      phone: c.phone,
      email: c.email,
      matchedOn,
      confidence: confidenceOf(matchedOn),
      lastActivityAt: c.lastActivityAt,
    });
  }

  for (const l of leadMatches) {
    // A lead already attached to a matched customer adds no new information.
    if (l.customerId && out.some((o) => o.customerId === l.customerId)) continue;
    const matchedOn = matchReasons(
      { phone: l.phone, email: l.email, nameNormalised: l.nameNormalised },
      { phone, email, name },
    );
    if (matchedOn.length === 0) continue;
    out.push({
      customerId: l.customerId,
      leadId: l.id,
      customerCode: l.leadCode,
      name: l.customerName,
      phone: l.phone,
      email: l.email,
      matchedOn,
      confidence: confidenceOf(matchedOn),
      lastActivityAt: l.createdAt.toISOString(),
    });
  }

  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
  return out.sort((a, b) => rank[a.confidence] - rank[b.confidence]).slice(0, 8);
}

type MatchReason = DuplicateCandidate['matchedOn'][number];

function matchReasons(
  row: { phone: string | null; email: string | null; nameNormalised: string | null },
  probe: { phone: string; email?: string | undefined; name: string },
): MatchReason[] {
  const reasons: MatchReason[] = [];
  const phoneHit = Boolean(row.phone && row.phone === probe.phone);
  const emailHit = Boolean(probe.email && row.email && row.email === probe.email);
  const nameHit = Boolean(row.nameNormalised && row.nameNormalised === probe.name);

  if (phoneHit) reasons.push('PHONE');
  if (emailHit) reasons.push('EMAIL');
  if (nameHit && phoneHit) reasons.push('NAME_PHONE');
  if (nameHit && emailHit) reasons.push('NAME_EMAIL');
  return reasons;
}

/**
 * A shared phone or email is a strong signal on its own. A name match alone is
 * not enough to call it a duplicate — "Priya Sharma" is not rare.
 */
function confidenceOf(reasons: MatchReason[]): DuplicateCandidate['confidence'] {
  if (reasons.includes('NAME_PHONE') || reasons.includes('NAME_EMAIL')) return 'HIGH';
  if (reasons.includes('PHONE') || reasons.includes('EMAIL')) return 'MEDIUM';
  return 'LOW';
}
