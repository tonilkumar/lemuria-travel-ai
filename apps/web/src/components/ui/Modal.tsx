import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Dialog built on the native element, so focus trapping, Escape handling and
 * inert background content come from the platform rather than from us.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const WIDTH = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' } as const;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // Clicking the backdrop closes; clicking the panel must not.
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="modal-title"
      className={cn(
        'w-[calc(100vw-2rem)] rounded-xl border border-ink-200 bg-white p-0 shadow-overlay',
        'backdrop:bg-navy-950/40 backdrop:backdrop-blur-[2px]',
        WIDTH[size],
      )}
    >
      <header className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4">
        <div>
          <h2 id="modal-title" className="text-base font-semibold text-ink-900">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-lg p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>

      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>

      {footer && (
        <footer className="flex justify-end gap-2 border-t border-ink-200 bg-ink-50/60 px-5 py-3">
          {footer}
        </footer>
      )}
    </dialog>
  );
}
