import { AlertTriangle, Inbox, Loader2, Lock, SearchX, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from './Button';

/**
 * The states every page must handle (spec §55). Rendering one of these is
 * always preferable to a blank screen.
 */

function Shell({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}
    >
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-ink-100 text-ink-400">
        {icon}
      </div>
      <p className="text-sm font-semibold text-ink-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 px-6 py-14 text-sm text-ink-500',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function EmptyState({
  title = 'Nothing here yet',
  description,
  action,
  className,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Shell
      icon={<Inbox className="size-5" aria-hidden />}
      title={title}
      description={description}
      action={action}
      className={className}
    />
  );
}

export function NoResultsState({
  onClear,
  className,
}: {
  onClear?: () => void;
  className?: string;
}) {
  return (
    <Shell
      icon={<SearchX className="size-5" aria-hidden />}
      title="No matches"
      description="No records match the filters you have applied."
      action={
        onClear ? (
          <Button variant="secondary" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        ) : undefined
      }
      className={className}
    />
  );
}

export function PermissionDeniedState({ className }: { className?: string }) {
  return (
    <Shell
      icon={<Lock className="size-5" aria-hidden />}
      title="You do not have access"
      description="Ask a manager if you need this section opened up for your role."
      className={className}
    />
  );
}

/**
 * Picks the message from the error itself: a dead connection, a permission
 * problem and a server fault each need a different response from the user, so
 * they must not all read "something went wrong".
 */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const apiError = error instanceof ApiError ? error : null;

  if (apiError?.code === 'FORBIDDEN') return <PermissionDeniedState className={className} />;

  const offline = apiError?.status === 0 || apiError?.code === 'DEPENDENCY_FAILURE';

  return (
    <Shell
      icon={
        offline ? (
          <WifiOff className="size-5" aria-hidden />
        ) : (
          <AlertTriangle className="size-5" aria-hidden />
        )
      }
      title={offline ? 'Cannot reach the server' : 'Something went wrong'}
      description={
        <>
          {apiError?.message ?? 'An unexpected error occurred.'}
          {apiError?.requestId && (
            <span className="mt-1 block font-mono text-[11px] text-ink-400">
              Reference: {apiError.requestId}
            </span>
          )}
        </>
      }
      action={
        onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
      className={className}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-ink-200/70', className)} aria-hidden />;
}

export function TableSkeleton({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y divide-ink-200/70" aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-5 py-3.5">
          {Array.from({ length: columns }).map((__, c) => (
            <Skeleton key={c} className={cn('h-4', c === 0 ? 'w-48' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}
