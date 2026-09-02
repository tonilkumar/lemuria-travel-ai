import { cn } from '@/lib/utils';

export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

/**
 * Underlined tab bar. Scrolls horizontally on narrow screens rather than
 * wrapping, so the tab row never pushes the table below the fold on mobile.
 */
export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('border-b border-ink-200', className)}>
      <div className="-mb-px flex gap-1 overflow-x-auto" role="tablist">
        {items.map((item) => {
          const active = item.key === value;
          return (
            <button
              key={item.key}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.key)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5',
                'text-sm font-medium transition-colors',
                active
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-700',
              )}
            >
              {item.label}
              {item.count !== undefined && (
                <span
                  className={cn(
                    'tabular rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                    active ? 'bg-teal-100 text-teal-700' : 'bg-ink-100 text-ink-500',
                  )}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
