import type { GenerateQuotationContentInput } from '@lemuria/shared';
import { Bot, Check, Pencil, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, CardBody, CardHeader, Select, Textarea } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { ApiError } from '@/lib/api';
import {
  useGenerateDraft,
  useReviewDraft,
  useUpdateContent,
  type AiDraft,
  type QuotationVersion,
} from './api';

type Kind = GenerateQuotationContentInput['kind'];

const SECTIONS: { kind: Kind; label: string; isList: boolean; placeholder: string }[] = [
  {
    kind: 'INTRO',
    label: 'Introduction',
    isList: false,
    placeholder: 'A short opening paragraph about this trip',
  },
  { kind: 'INCLUSIONS', label: 'What is included', isList: true, placeholder: 'One item per line' },
  {
    kind: 'EXCLUSIONS',
    label: 'What is not included',
    isList: true,
    placeholder: 'One item per line',
  },
  {
    kind: 'TERMS',
    label: 'Booking terms',
    isList: false,
    placeholder: 'Payment, cancellation and amendment terms',
  },
];

/**
 * Quotation copy, with optional AI drafting.
 *
 * An AI draft never lands in the quotation directly. It appears here for a
 * human to read, edit and approve, and only the approve action writes it —
 * which requires `ai.approve`, a permission an executive does not hold.
 */
export function ContentPanel({
  version,
  editable,
}: {
  version: QuotationVersion;
  editable: boolean;
}) {
  const { can } = useAuth();
  const update = useUpdateContent();
  const generate = useGenerateDraft();
  const review = useReviewDraft();

  const [drafts, setDrafts] = useState<Partial<Record<Kind, AiDraft | undefined>>>({});
  const [editedDraft, setEditedDraft] = useState<Partial<Record<Kind, string>>>({});
  const [values, setValues] = useState<Record<Kind, string>>({
    INTRO: version.introText ?? '',
    INCLUSIONS: (version.inclusions ?? []).join('\n'),
    EXCLUSIONS: (version.exclusions ?? []).join('\n'),
    TERMS: version.termsText ?? '',
  });
  const [tone, setTone] = useState<GenerateQuotationContentInput['tone']>('WARM');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Kind | null>(null);

  const save = async (kind: Kind, isList: boolean) => {
    setError(null);
    try {
      const text = values[kind];
      const listField = kind === 'INCLUSIONS' ? 'inclusions' : 'exclusions';
      await update.mutateAsync({
        versionId: version.id,
        ...(kind === 'INTRO' ? { introText: text } : {}),
        ...(kind === 'TERMS' ? { termsText: text } : {}),
        ...(isList
          ? {
              [listField]: text
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean),
            }
          : {}),
      });
      setSaved(kind);
      setTimeout(() => setSaved(null), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that section.');
    }
  };

  const draft = async (kind: Kind) => {
    setError(null);
    try {
      const result = await generate.mutateAsync({ versionId: version.id, kind, tone });
      setDrafts((d) => ({ ...d, [kind]: result }));
      setEditedDraft((d) => ({ ...d, [kind]: result.text }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not draft that section.');
    }
  };

  const decide = async (kind: Kind, decision: 'APPROVE' | 'REJECT') => {
    const current = drafts[kind];
    if (!current) return;
    setError(null);
    try {
      await review.mutateAsync({
        generationId: current.generationId,
        decision,
        ...(decision === 'APPROVE' ? { editedText: editedDraft[kind] ?? current.text } : {}),
        ...(decision === 'REJECT' ? { reason: 'Not suitable' } : {}),
      });
      if (decision === 'APPROVE') {
        setValues((v) => ({ ...v, [kind]: editedDraft[kind] ?? current.text }));
      }
      setDrafts((d) => ({ ...d, [kind]: undefined }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record that decision.');
    }
  };

  return (
    <>
      <CardHeader
        title="Quotation copy"
        description={editable ? 'What the customer reads on the PDF' : 'Frozen with this version'}
        action={
          editable && can('ai.use') ? (
            <Select
              aria-label="Tone"
              value={tone}
              onChange={(e) => setTone(e.target.value as GenerateQuotationContentInput['tone'])}
              options={[
                { value: 'WARM', label: 'Warm' },
                { value: 'CONCISE', label: 'Concise' },
                { value: 'PREMIUM', label: 'Premium' },
              ]}
              className="w-32"
            />
          ) : null
        }
      />

      {error && (
        <p
          role="alert"
          className="border-b border-danger-100 bg-danger-50 px-5 py-2 text-sm text-danger-600"
        >
          {error}
        </p>
      )}

      <CardBody className="space-y-6">
        {SECTIONS.map((section) => {
          const pending = drafts[section.kind];
          return (
            <div key={section.kind}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-ink-700">{section.label}</span>
                <div className="flex items-center gap-1">
                  {saved === section.kind && (
                    <span className="flex items-center gap-1 text-[11px] text-success-600">
                      <Check className="size-3" aria-hidden />
                      saved
                    </span>
                  )}
                  {editable && can('ai.use') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      leadingIcon={<Sparkles className="size-3.5" aria-hidden />}
                      loading={generate.isPending && generate.variables?.kind === section.kind}
                      onClick={() => void draft(section.kind)}
                    >
                      Draft with AI
                    </Button>
                  )}
                </div>
              </div>

              <Textarea
                aria-label={section.label}
                value={values[section.kind]}
                placeholder={section.placeholder}
                disabled={!editable}
                onChange={(e) => setValues((v) => ({ ...v, [section.kind]: e.target.value }))}
                className={section.isList ? 'min-h-24' : 'min-h-28'}
              />

              {editable && (
                <div className="mt-1.5 flex justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={update.isPending}
                    onClick={() => void save(section.kind, section.isList)}
                  >
                    Save
                  </Button>
                </div>
              )}

              {/* An AI draft waits here until a human decides. */}
              {pending && (
                <div className="mt-2 rounded-lg border border-teal-200 bg-teal-50/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-teal-800">
                      <Bot className="size-3.5" aria-hidden />
                      AI draft — not applied yet
                    </span>
                    <Badge tone="neutral">{pending.model}</Badge>
                  </div>

                  <Textarea
                    aria-label={`AI draft for ${section.label}`}
                    value={editedDraft[section.kind] ?? pending.text}
                    onChange={(e) =>
                      setEditedDraft((d) => ({ ...d, [section.kind]: e.target.value }))
                    }
                    className="min-h-24 bg-white"
                  />

                  <p className="mt-1.5 text-[11px] text-teal-700">
                    Edit it if you want, then approve to write it into the quotation.
                  </p>

                  <div className="mt-2 flex justify-end gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      leadingIcon={<X className="size-3.5" aria-hidden />}
                      onClick={() => void decide(section.kind, 'REJECT')}
                    >
                      Discard
                    </Button>
                    {can('ai.approve') ? (
                      <Button
                        size="sm"
                        leadingIcon={<Pencil className="size-3.5" aria-hidden />}
                        loading={review.isPending}
                        onClick={() => void decide(section.kind, 'APPROVE')}
                      >
                        Approve and apply
                      </Button>
                    ) : (
                      <span className="self-center text-[11px] text-ink-500">
                        A manager must approve AI copy before it can be used.
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardBody>
    </>
  );
}
