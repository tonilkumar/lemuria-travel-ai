import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/format';

interface Stage {
  key: string;
  label: string;
  count: number;
  conversionPct: number;
}

/**
 * Horizontal funnel. Bar width is relative to the top of the funnel, so the
 * drop-off between stages is readable at a glance rather than requiring the
 * reader to compare numbers.
 */
export function FunnelChart({ stages }: { stages: Stage[] }) {
  const top = stages[0]?.count ?? 0;

  return (
    <ol className="space-y-2.5">
      {stages.map((stage, i) => {
        const width = top === 0 ? 0 : Math.max(4, (stage.count / top) * 100);
        const previous = stages[i - 1];
        const stepDrop =
          previous && previous.count > 0
            ? Math.round((1 - stage.count / previous.count) * 100)
            : null;

        return (
          <li key={stage.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="font-medium text-ink-700">{stage.label}</span>
              <span className="tabular text-ink-500">
                {formatNumber(stage.count)}
                <span className="ml-1.5 text-ink-400">{stage.conversionPct}%</span>
              </span>
            </div>
            <div className="h-6 overflow-hidden rounded-md bg-ink-100">
              <div
                className={cn(
                  'h-full rounded-md transition-all',
                  i === stages.length - 1 ? 'bg-success-500' : 'bg-teal-500',
                )}
                style={{ width: `${width}%`, opacity: 1 - i * 0.13 }}
              />
            </div>
            {stepDrop !== null && stepDrop > 0 && (
              <p className="mt-0.5 text-[10px] text-ink-400">{stepDrop}% drop from previous stage</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
