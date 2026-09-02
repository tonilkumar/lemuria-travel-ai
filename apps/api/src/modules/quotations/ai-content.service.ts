import type { AuthenticatedUser, GenerateQuotationContentInput } from '@lemuria/shared';
import { isVersionEditable } from '@lemuria/shared';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { customers } from '../../db/schema/customers.js';
import {
  quotationItems,
  quotationPackages,
  quotations,
  quotationVersions,
} from '../../db/schema/quotations.js';
import { aiGenerations } from '../../db/schema/system.js';
import { recordAudit, type AuditContext } from '../../lib/audit.js';
import { badRequest, invalidTransition, notFound } from '../../lib/errors.js';
import { getAI } from '../../providers/ai/index.js';

/**
 * AI drafting for quotation copy.
 *
 * Two rules hold this together and neither has an override:
 *
 * 1. Nothing generated here reaches a customer without a human approving it.
 *    Output lands as GENERATED and the apply path refuses anything that is not
 *    APPROVED (spec §24).
 * 2. The model sees the minimum needed to write the paragraph. Names and
 *    contact details are substituted locally after the model returns, unless
 *    AI_ALLOW_PII is explicitly on. Passport and identity numbers are never
 *    sent under any setting — the context builder cannot reach them (spec §46).
 */

const NAME_PLACEHOLDER = '{{CUSTOMER_NAME}}';

const TONE_GUIDANCE: Record<string, string> = {
  WARM: 'Warm and personal, the way a trusted travel consultant writes to a returning client.',
  CONCISE: 'Brief and factual. Short sentences. No filler.',
  PREMIUM: 'Understated and refined, suited to a high-value booking. Never gushing.',
};

const SYSTEM_PROMPT = `You write copy for Lemuria India Holidays, a travel company in India, for quotations sent to their customers.

Rules:
- Write only the requested section. No headings, no preamble, no sign-off.
- Never invent prices, dates, hotel names, inclusions or terms that are not in the brief.
- Never promise availability, visa outcomes or refunds.
- Use Indian English. Write amounts as given; do not convert currencies.
- Where the brief uses ${NAME_PLACEHOLDER}, keep that token exactly as written.
- If the brief is too thin to write from, say so in one sentence instead of inventing detail.`;

const LIST_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 20,
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

interface QuotationBrief {
  prompt: string;
  containedPii: boolean;
  /** Substitutions applied to the model's output after it returns. */
  substitutions: Record<string, string>;
}

/**
 * Assembles the smallest brief that can produce good copy.
 *
 * Deliberately excludes cost, margin, supplier names and any customer
 * identifier — a paragraph about a Bali holiday does not need to know what
 * Lemuria paid for the hotel or what the customer's phone number is.
 */
async function buildBrief(
  versionId: string,
  kind: GenerateQuotationContentInput['kind'],
  tone: string,
  extraGuidance: string | undefined,
): Promise<QuotationBrief> {
  const [row] = await db
    .select({
      version: quotationVersions,
      quotation: quotations,
      customerName: customers.fullName,
      customerTier: customers.tier,
    })
    .from(quotationVersions)
    .innerJoin(quotations, eq(quotations.id, quotationVersions.quotationId))
    .leftJoin(customers, eq(customers.id, quotations.customerId))
    .where(eq(quotationVersions.id, versionId))
    .limit(1);

  if (!row) throw notFound('Quotation version');

  const packages = await db
    .select({
      id: quotationPackages.id,
      name: quotationPackages.name,
      description: quotationPackages.description,
      isRecommended: quotationPackages.isRecommended,
      sellingPrice: quotationPackages.sellingPrice,
      perPersonPrice: quotationPackages.perPersonPrice,
      travellerCount: quotationPackages.travellerCount,
    })
    .from(quotationPackages)
    .where(eq(quotationPackages.versionId, versionId))
    .orderBy(asc(quotationPackages.sortOrder));

  const items = packages.length
    ? await db
        .select({
          packageId: quotationItems.packageId,
          category: quotationItems.category,
          description: quotationItems.description,
          quantity: quotationItems.quantity,
          dayNumber: quotationItems.dayNumber,
        })
        .from(quotationItems)
        .where(
          inArray(
            quotationItems.packageId,
            packages.map((p) => p.id),
          ),
        )
        .orderBy(asc(quotationItems.sortOrder))
    : [];

  const q = row.quotation;
  const allowPii = env.AI_ALLOW_PII;
  const substitutions: Record<string, string> = {};

  let customerLabel = NAME_PLACEHOLDER;
  if (allowPii && row.customerName) {
    customerLabel = row.customerName;
  } else if (row.customerName) {
    // The real name is stitched in after the model returns.
    substitutions[NAME_PLACEHOLDER] = row.customerName;
  }

  const lines: string[] = [
    `Section to write: ${kind}`,
    `Tone: ${TONE_GUIDANCE[tone] ?? TONE_GUIDANCE.WARM}`,
    '',
    'Trip brief:',
    `- Title: ${q.title}`,
    `- Customer: ${customerLabel}${row.customerTier && row.customerTier !== 'BRONZE' ? ` (${row.customerTier.toLowerCase()} tier, a returning client)` : ''}`,
  ];

  if (q.destination) lines.push(`- Destination: ${q.destination}`);
  if (q.travelStartDate) {
    lines.push(
      `- Travel dates: ${q.travelStartDate}${q.travelEndDate ? ` to ${q.travelEndDate}` : ''}`,
    );
  }
  lines.push(
    `- Travellers: ${q.travellersAdults} adult${q.travellersAdults === 1 ? '' : 's'}${q.travellersChildren ? `, ${q.travellersChildren} children` : ''}`,
  );

  if (packages.length) {
    lines.push('', 'Packages offered:');
    for (const pkg of packages) {
      // Selling price only. Cost and margin are commercially sensitive and the
      // model has no use for them.
      const rupees = Math.round(pkg.sellingPrice / 100).toLocaleString('en-IN');
      lines.push(
        `- ${pkg.name}${pkg.isRecommended ? ' (recommended)' : ''}: INR ${rupees} total${
          pkg.perPersonPrice
            ? `, INR ${Math.round(pkg.perPersonPrice / 100).toLocaleString('en-IN')} per person`
            : ''
        }`,
      );
      if (pkg.description) lines.push(`  ${pkg.description}`);

      const own = items.filter((i) => i.packageId === pkg.id);
      for (const item of own.slice(0, 25)) {
        lines.push(
          `  - ${item.category.toLowerCase()}: ${item.description}${item.quantity > 1 ? ` x${item.quantity}` : ''}${item.dayNumber ? ` (day ${item.dayNumber})` : ''}`,
        );
      }
    }
  }

  if (kind === 'EXCLUSIONS' && row.version.inclusions?.length) {
    lines.push('', 'Already listed as included (do not repeat these):');
    for (const inc of row.version.inclusions.slice(0, 30)) lines.push(`- ${inc}`);
  }

  if (extraGuidance) lines.push('', `Additional guidance from the consultant: ${extraGuidance}`);

  return {
    prompt: lines.join('\n'),
    containedPii: allowPii && Boolean(row.customerName),
    substitutions,
  };
}

const KIND_INSTRUCTION: Record<string, string> = {
  INTRO: 'Write a short opening paragraph, 60 to 100 words, introducing this trip.',
  INCLUSIONS: 'List what this package includes, as short phrases. One item per entry.',
  EXCLUSIONS: 'List what this package does not include, as short phrases. One item per entry.',
  TERMS: 'Write standard booking terms for this quotation, 100 to 160 words, as a short paragraph or a few sentences. Cover payment, cancellation and amendment in general terms only.',
};

export interface DraftResult {
  generationId: string;
  kind: string;
  text: string;
  items: string[] | null;
  status: string;
  provider: string;
  model: string;
  latencyMs: number;
}

/**
 * Produces a draft and records it for review. Never writes to the quotation.
 */
export async function generateContent(
  versionId: string,
  input: GenerateQuotationContentInput,
  viewer: AuthenticatedUser,
  ctx: AuditContext,
): Promise<DraftResult> {
  const ai = getAI();

  if (!ai.isConfigured) {
    throw badRequest(
      'AI drafting is not configured yet. Write the copy directly, or ask an administrator to add an AI provider key.',
    );
  }

  const [version] = await db
    .select()
    .from(quotationVersions)
    .where(eq(quotationVersions.id, versionId))
    .limit(1);

  if (!version) throw notFound('Quotation version');
  if (!isVersionEditable(version.status)) {
    throw invalidTransition('This version is no longer editable, so its copy cannot be redrafted.', {
      status: version.status,
    });
  }

  const brief = await buildBrief(versionId, input.kind, input.tone, input.extraGuidance);
  const wantsList = input.kind === 'INCLUSIONS' || input.kind === 'EXCLUSIONS';

  const result = await ai.generate({
    system: SYSTEM_PROMPT,
    prompt: `${brief.prompt}\n\n${KIND_INSTRUCTION[input.kind] ?? ''}`,
    effort: 'low',
    ...(wantsList
      ? { jsonSchema: { name: 'quotation_list', schema: LIST_SCHEMA as unknown as Record<string, unknown> } }
      : {}),
  });

  if (result.refused) {
    throw badRequest(
      result.refusalReason === 'not_configured'
        ? 'AI drafting is not configured yet.'
        : 'The AI service declined to draft this. Write the copy directly.',
    );
  }

  // Names stitched back in locally, so they never left the building.
  const restore = (text: string): string =>
    Object.entries(brief.substitutions).reduce(
      (acc, [token, value]) => acc.split(token).join(value),
      text,
    );

  let items: string[] | null = null;
  let text = restore(result.text);

  if (wantsList) {
    const parsed = result.parsed as { items?: unknown } | undefined;
    if (Array.isArray(parsed?.items)) {
      items = parsed.items.filter((i): i is string => typeof i === 'string').map(restore);
      text = items.join('\n');
    } else {
      // The schema did not come back clean; recover the list from the text
      // rather than discarding a usable draft.
      items = text
        .split('\n')
        .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
        .filter(Boolean);
    }
  }

  const [generation] = await db
    .insert(aiGenerations)
    .values({
      kind: `QUOTATION_${input.kind}`,
      entityType: 'quotation_version',
      entityId: versionId,
      provider: result.provider,
      model: result.model,
      // A redacted summary only — the full brief is not retained.
      promptSummary: `${input.kind} draft, ${input.tone.toLowerCase()} tone, ${brief.prompt.length} chars of brief`,
      outputText: text,
      status: 'GENERATED',
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs,
      containedPii: brief.containedPii,
      requestedById: viewer.id,
    })
    .returning({ id: aiGenerations.id, status: aiGenerations.status });

  if (!generation) throw new Error('AI generation insert returned no row');

  await recordAudit({
    ...ctx,
    action: 'ai.generated',
    entityType: 'quotation_version',
    entityId: versionId,
    after: { kind: input.kind, provider: result.provider, model: result.model },
    summary: `AI drafted ${input.kind.toLowerCase()} copy — awaiting review`,
  });

  return {
    generationId: generation.id,
    kind: input.kind,
    text,
    items,
    status: generation.status,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
  };
}

/**
 * Approves a draft — optionally with the reviewer's edits — and writes it into
 * the quotation.
 *
 * This is the only path from an AI draft to customer-facing copy, and it always
 * runs through a human decision.
 */
export async function reviewDraft(
  generationId: string,
  decision: 'APPROVE' | 'REJECT',
  editedText: string | undefined,
  reason: string | undefined,
  viewer: AuthenticatedUser,
  ctx: AuditContext,
) {
  const [generation] = await db
    .select()
    .from(aiGenerations)
    .where(eq(aiGenerations.id, generationId))
    .limit(1);

  if (!generation) throw notFound('AI draft');
  if (generation.status === 'APPROVED' || generation.status === 'SENT') {
    throw invalidTransition('This draft has already been approved.');
  }
  if (decision === 'REJECT' && !reason?.trim()) {
    throw badRequest('Say what was wrong with the draft.');
  }

  const versionId = generation.entityId;
  if (!versionId) throw badRequest('This draft is not attached to a quotation version.');

  return db.transaction(async (tx) => {
    const finalText = (editedText ?? generation.outputText ?? '').trim();

    await tx
      .update(aiGenerations)
      .set({
        status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        editedText: editedText ?? null,
        reviewedById: viewer.id,
        reviewedAt: new Date(),
        rejectionReason: decision === 'REJECT' ? (reason ?? null) : null,
      })
      .where(eq(aiGenerations.id, generationId));

    if (decision === 'APPROVE') {
      const [version] = await tx
        .select()
        .from(quotationVersions)
        .where(eq(quotationVersions.id, versionId))
        .limit(1);

      if (!version) throw notFound('Quotation version');
      if (!isVersionEditable(version.status)) {
        throw invalidTransition('This version is no longer editable.');
      }

      const kind = generation.kind.replace('QUOTATION_', '');
      const asList = finalText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      await tx
        .update(quotationVersions)
        .set(
          kind === 'INTRO'
            ? { introText: finalText }
            : kind === 'TERMS'
              ? { termsText: finalText }
              : kind === 'INCLUSIONS'
                ? { inclusions: asList }
                : { exclusions: asList },
        )
        .where(eq(quotationVersions.id, versionId));
    }

    await recordAudit(
      {
        ...ctx,
        action: decision === 'APPROVE' ? 'ai.approved' : 'ai.rejected',
        entityType: 'quotation_version',
        entityId: versionId,
        after: { kind: generation.kind, edited: Boolean(editedText) },
        summary:
          decision === 'APPROVE'
            ? `AI ${generation.kind.toLowerCase()} draft approved${editedText ? ' with edits' : ' as written'}`
            : `AI draft rejected: ${reason}`,
      },
      tx,
    );

    return { status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', appliedText: finalText };
  });
}

/** Draft history for a version, so a reviewer can see what was suggested before. */
export async function draftHistory(versionId: string) {
  return db
    .select({
      id: aiGenerations.id,
      kind: aiGenerations.kind,
      status: aiGenerations.status,
      outputText: aiGenerations.outputText,
      editedText: aiGenerations.editedText,
      rejectionReason: aiGenerations.rejectionReason,
      provider: aiGenerations.provider,
      model: aiGenerations.model,
      containedPii: aiGenerations.containedPii,
      createdAt: aiGenerations.createdAt,
      reviewedAt: aiGenerations.reviewedAt,
    })
    .from(aiGenerations)
    .where(
      and(eq(aiGenerations.entityType, 'quotation_version'), eq(aiGenerations.entityId, versionId)),
    )
    .orderBy(desc(aiGenerations.createdAt))
    .limit(30);
}
