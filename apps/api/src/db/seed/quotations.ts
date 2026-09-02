import type { Db } from '../client.js';
import { settings, taxRates } from '../schema/masterdata.js';

/**
 * Tax rates and approval thresholds.
 *
 * Every row here is a **placeholder**, seeded so the quotation module is
 * usable end to end — not because the treatment has been confirmed. Indian
 * travel GST has several defensible readings and the choice belongs to
 * Lemuria's accountant; `isProvisional` stays true until they say otherwise,
 * and the quotation PDF prints a caveat while it is.
 *
 * See docs/OPEN-QUESTIONS.md.
 */

const PROVISIONAL_NOTE =
  'PLACEHOLDER pending confirmation by Lemuria\'s accountant. Tour operator services are commonly treated at 5% without input tax credit (Notification 11/2017-CT(R) as amended); 18% with credit and margin-scheme treatments also exist. Do not rely on this rate for filing.';

export const TAX_RATES = [
  {
    serviceCategory: 'HOTEL',
    name: 'Accommodation — 5% without ITC (provisional)',
    rateBps: 500,
    basis: 'GROSS',
    inputCreditAllowed: false,
  },
  {
    serviceCategory: 'FLIGHT',
    name: 'Air travel — 5% (provisional)',
    rateBps: 500,
    basis: 'GROSS',
    inputCreditAllowed: false,
  },
  {
    serviceCategory: 'TRANSFER',
    name: 'Ground transport — 5% (provisional)',
    rateBps: 500,
    basis: 'GROSS',
    inputCreditAllowed: false,
  },
  {
    serviceCategory: 'ACTIVITY',
    name: 'Activities and sightseeing — 5% (provisional)',
    rateBps: 500,
    basis: 'GROSS',
    inputCreditAllowed: false,
  },
  {
    serviceCategory: 'MEAL',
    name: 'Meals — 5% (provisional)',
    rateBps: 500,
    basis: 'GROSS',
    inputCreditAllowed: false,
  },
  {
    serviceCategory: 'GUIDE',
    name: 'Guide services — 5% (provisional)',
    rateBps: 500,
    basis: 'GROSS',
    inputCreditAllowed: false,
  },
  {
    serviceCategory: 'MISC',
    name: 'Other services — 5% (provisional)',
    rateBps: 500,
    basis: 'GROSS',
    inputCreditAllowed: false,
  },
  // Statutory fees collected on the customer's behalf are not Lemuria's supply.
  // They are billed at cost and carry no markup, so no tax is added here.
  {
    serviceCategory: 'VISA',
    name: 'Visa fees — collected at cost, no tax added',
    rateBps: 0,
    basis: 'EXEMPT',
    inputCreditAllowed: false,
  },
  {
    serviceCategory: 'PERMIT',
    name: 'Permits — collected at cost, no tax added',
    rateBps: 0,
    basis: 'EXEMPT',
    inputCreditAllowed: false,
  },
  {
    serviceCategory: 'INSURANCE',
    name: 'Travel insurance — collected at cost, no tax added',
    rateBps: 0,
    basis: 'EXEMPT',
    inputCreditAllowed: false,
  },
] as const;

export async function seedQuotationConfig(db: Db): Promise<{ rates: number; settings: number }> {
  await db
    .insert(taxRates)
    .values(
      TAX_RATES.map((r) => ({
        serviceCategory: r.serviceCategory,
        name: r.name,
        rateBps: r.rateBps,
        basis: r.basis,
        inputCreditAllowed: r.inputCreditAllowed,
        isProvisional: true,
        authorityNote: PROVISIONAL_NOTE,
        effectiveFrom: '2026-04-01',
        isActive: true,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(settings)
    .values([
      {
        key: 'quotation.highValueThresholdPaise',
        value: 50_000_000,
        description:
          'PLACEHOLDER (₹5,00,000). Quotations at or above this selling price need manager approval. Confirm the real figure with Lemuria.',
      },
      {
        key: 'quotation.minimumMarginBps',
        value: 1000,
        description:
          'PLACEHOLDER (10%). Quotations at or below this margin need manager approval. Confirm the real figure with Lemuria.',
      },
    ])
    .onConflictDoNothing();

  return { rates: TAX_RATES.length, settings: 2 };
}
