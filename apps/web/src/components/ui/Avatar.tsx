import { cn, initials } from '@/lib/utils';

const SIZES = { sm: 'size-7 text-[11px]', md: 'size-9 text-xs', lg: 'size-11 text-sm' } as const;

/**
 * Falls back to initials on a deterministic tint, so a roster of executives
 * without photos still reads as distinct people rather than identical greys.
 */
export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const TINTS = [
    'bg-teal-100 text-teal-800',
    'bg-cold-100 text-cold-700',
    'bg-warm-100 text-warm-700',
    'bg-success-100 text-success-700',
    'bg-ink-200 text-ink-700',
  ];
  const tint = TINTS[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % TINTS.length];

  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={cn('rounded-full object-cover ring-1 ring-ink-200', SIZES[size], className)}
      />
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold select-none',
        SIZES[size],
        tint,
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
