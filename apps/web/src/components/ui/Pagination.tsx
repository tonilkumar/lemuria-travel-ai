import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

/**
 * Server-side pagination controls. The page size is bounded by the API, so the
 * browser is never asked to hold an unbounded result set (spec §38).
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 px-5 py-3">
      <p className="tabular text-xs text-ink-500">
        Showing <span className="font-medium text-ink-700">{first}</span>
        {' to '}
        <span className="font-medium text-ink-700">{last}</span>
        {' of '}
        <span className="font-medium text-ink-700">{total}</span>
      </p>

      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Rows per page"
            className="h-8 rounded-lg border border-ink-300 bg-white px-2 text-xs text-ink-700"
          >
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} per page
              </option>
            ))}
          </select>
        )}
        <Button
          variant="secondary"
          size="icon"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <span className="tabular px-1 text-xs text-ink-600">
          {page} / {totalPages}
        </span>
        <Button
          variant="secondary"
          size="icon"
          aria-label="Next page"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
