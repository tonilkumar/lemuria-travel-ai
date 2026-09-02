import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Status colours are defined once, here, and reused by every module so a HOT
 * lead looks identical on the dashboard, the lead table and the lead detail
 * page (spec §36).
 */
const TONES = {
  hot: 'bg-hot-50 text-hot-700 ring-hot-500/20',
  warm: 'bg-warm-50 text-warm-700 ring-warm-500/20',
  cold: 'bg-cold-50 text-cold-700 ring-cold-500/20',
  success: 'bg-success-50 text-success-700 ring-success-500/20',
  danger: 'bg-danger-50 text-danger-600 ring-danger-500/20',
  neutral: 'bg-ink-100 text-ink-600 ring-ink-300/40',
  teal: 'bg-teal-50 text-teal-700 ring-teal-500/20',
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  tone = 'neutral',
  children,
  className,
  dot = false,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5',
        'text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />}
      {children}
    </span>
  );
}

const CLASSIFICATION_TONE: Record<string, BadgeTone> = {
  HOT: 'hot',
  WARM: 'warm',
  COLD: 'cold',
};

export function ClassificationBadge({ value, score }: { value: string; score?: number }) {
  return (
    <Badge tone={CLASSIFICATION_TONE[value] ?? 'neutral'} dot>
      {value}
      {score !== undefined && <span className="tabular opacity-70">{score}</span>}
    </Badge>
  );
}

const STATUS_TONE: Record<string, BadgeTone> = {
  OPEN: 'teal',
  IN_PROGRESS: 'warm',
  QUOTATION_SENT: 'cold',
  CONVERTED: 'success',
  LOST: 'danger',
  NO_RESPONSE: 'neutral',
  PENDING: 'warm',
  COMPLETED: 'success',
  OVERDUE: 'danger',
  CANCELLED: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: 'In Progress',
  QUOTATION_SENT: 'Quotation Sent',
  NO_RESPONSE: 'No Response',
};

export function StatusBadge({ value }: { value: string }) {
  const label =
    STATUS_LABEL[value] ??
    value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
  return <Badge tone={STATUS_TONE[value] ?? 'neutral'}>{label}</Badge>;
}
