import type { AuthenticatedUser } from '@lemuria/shared';
import { ChevronDown, LogOut, User } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrator',
  MANAGER: 'Manager',
  EXECUTIVE: 'Sales Executive',
  FINANCE: 'Finance',
  OPERATIONS: 'Operations',
};

export function UserMenu({ user }: { user: AuthenticatedUser }) {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);

  const primaryRole = user.roles[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-ink-100"
      >
        <Avatar name={user.fullName} src={user.avatarUrl} size="sm" />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-xs font-medium text-ink-800">{user.fullName}</span>
          <span className="block text-[10px] text-ink-500">
            {primaryRole ? (ROLE_LABEL[primaryRole] ?? primaryRole) : ''}
          </span>
        </span>
        <ChevronDown className="size-3.5 text-ink-400" aria-hidden />
      </button>

      {open && (
        <>
          <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-ink-200 bg-white py-1 shadow-overlay">
            <div className="border-b border-ink-200 px-4 py-3">
              <p className="text-sm font-medium text-ink-900">{user.fullName}</p>
              <p className="truncate text-xs text-ink-500">{user.email}</p>
            </div>
            <button
              role="menuitem"
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-ink-700 hover:bg-ink-50"
            >
              <User className="size-4" aria-hidden />
              My profile
            </button>
            <button
              role="menuitem"
              onClick={() => void signOut()}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-danger-600 hover:bg-danger-50"
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
