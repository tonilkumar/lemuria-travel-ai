import { Bell } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Notification affordance. The unread count comes from the notification
 * service; until that slice ships the bell renders in its empty state rather
 * than showing a fabricated badge.
 */
export function NotificationBell({ unreadCount = 0 }: { unreadCount?: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-700"
      >
        <Bell className="size-4.5" aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-danger-500 text-[9px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setOpen(false)} />
          <div
            className={cn(
              'absolute right-0 z-20 mt-2 w-80 rounded-xl border border-ink-200 bg-white shadow-overlay',
            )}
          >
            <p className="border-b border-ink-200 px-4 py-3 text-sm font-semibold text-ink-900">
              Notifications
            </p>
            <p className="px-4 py-8 text-center text-sm text-ink-500">You are all caught up.</p>
          </div>
        </>
      )}
    </div>
  );
}
