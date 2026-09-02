import type { Permission } from '@lemuria/shared';
import {
  BarChart3,
  Building2,
  CalendarClock,
  CreditCard,
  FileText,
  FolderLock,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  Map,
  Menu,
  MessageCircle,
  Plane,
  Plus,
  ScrollText,
  Search,
  Settings,
  Sliders,
  Users,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { cn } from '@/lib/utils';
import { NotificationBell } from './NotificationBell';
import { UserMenu } from './UserMenu';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: Permission;
  /** Rendered but disabled — the module ships in a later Phase 1 slice. */
  upcoming?: boolean;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

const NAVIGATION: NavGroup[] = [
  { items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.read' }] },
  {
    label: 'Sales',
    items: [
      { to: '/leads', label: 'Leads & Follow-ups', icon: Users, permission: 'lead.read' },
      { to: '/customers', label: 'Customers', icon: Building2, permission: 'customer.read' },
      { to: '/documents', label: 'Documents', icon: FolderLock, permission: 'document.read' },
    ],
  },
  {
    label: 'Create',
    items: [
      { to: '/quotations', label: 'AI Quotation', icon: FileText, permission: 'quotation.read', upcoming: true },
      { to: '/itineraries', label: 'AI Itinerary', icon: Map, permission: 'itinerary.read', upcoming: true },
    ],
  },
  {
    label: 'Documentation',
    items: [
      { to: '/visa', label: 'Visa Management', icon: Plane, permission: 'visa.read', upcoming: true },
      { to: '/passport', label: 'Passport Management', icon: ScrollText, permission: 'passport.read', upcoming: true },
    ],
  },
  {
    label: 'Communication',
    items: [
      { to: '/whatsapp', label: 'WhatsApp', icon: MessageCircle, permission: 'communication.read', upcoming: true },
      { to: '/email', label: 'Email Automation', icon: Mail, permission: 'communication.read', upcoming: true },
      { to: '/tasks', label: 'Tasks & Reminders', icon: CalendarClock, permission: 'followup.read' },
    ],
  },
  {
    label: 'Business',
    items: [
      { to: '/finance', label: 'Finance', icon: CreditCard, permission: 'finance.read', upcoming: true },
      { to: '/reports', label: 'Reports & Analytics', icon: BarChart3, permission: 'report.read', upcoming: true },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/master-data', label: 'Master Data', icon: Sliders, permission: 'masterdata.manage', upcoming: true },
      { to: '/settings', label: 'Settings', icon: Settings, permission: 'settings.manage', upcoming: true },
      { to: '/audit', label: 'Audit Trail', icon: LifeBuoy, permission: 'audit.read', upcoming: true },
    ],
  },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth();

  return (
    <>
      <div className="flex h-14 items-center gap-2.5 px-5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-teal-500/15 text-teal-300">
          <Plane className="size-4" aria-hidden />
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold tracking-wide text-white">LEMURIA</span>
          <span className="block text-[10px] font-medium tracking-[0.18em] text-teal-300/80">
            TRAVEL AI
          </span>
        </span>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Main">
        {NAVIGATION.map((group, i) => {
          const visible = group.items.filter((item) => !item.permission || can(item.permission));
          if (visible.length === 0) return null;

          return (
            <div key={group.label ?? i}>
              {group.label && (
                <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/35">
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {visible.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      onClick={onNavigate}
                      aria-disabled={item.upcoming || undefined}
                      className={({ isActive }) =>
                        cn(
                          'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                          isActive && !item.upcoming
                            ? 'bg-teal-500/15 font-medium text-white'
                            : 'text-white/65 hover:bg-white/5 hover:text-white',
                          item.upcoming && 'pointer-events-none opacity-40',
                        )
                      }
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden />
                      <span className="truncate">{item.label}</span>
                      {item.upcoming && (
                        <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide">
                          Soon
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
    </>
  );
}

/**
 * Application shell.
 *
 * Desktop keeps a persistent rail; tablet and mobile collapse it into an
 * overlay drawer rather than shrinking the desktop layout (spec §37).
 */
export function AppShell({
  children,
  onNewEnquiry,
}: {
  children: ReactNode;
  onNewEnquiry: () => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user } = useAuth();
  const location = useLocation();

  // Navigating on mobile should dismiss the drawer.
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  return (
    <div className="flex min-h-dvh bg-ink-50">
      {/* Persistent rail, lg and up */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col bg-navy-800 lg:flex">
        <SidebarContent />
      </aside>

      {/* Overlay drawer, below lg */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            className="absolute inset-0 bg-navy-950/50 backdrop-blur-[2px]"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-navy-800 shadow-overlay">
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-3 rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" aria-hidden />
            </button>
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink-200 bg-white/90 px-4 backdrop-blur-sm sm:px-6">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="rounded-lg p-1.5 text-ink-600 hover:bg-ink-100 lg:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </button>

          <div className="relative hidden max-w-md flex-1 sm:block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400"
              aria-hidden
            />
            <input
              type="search"
              placeholder="Search leads, customers, phone, quotation…"
              aria-label="Global search"
              className="h-9 w-full rounded-lg border border-ink-200 bg-ink-50 pl-9 pr-3 text-sm placeholder:text-ink-400 focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" leadingIcon={<Plus className="size-4" aria-hidden />} onClick={onNewEnquiry}>
              <span className="hidden sm:inline">New Enquiry</span>
            </Button>
            <NotificationBell />
            {user && <UserMenu user={user} />}
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-ink-200 bg-white px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-ink-900">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
