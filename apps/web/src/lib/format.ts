import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday } from 'date-fns';

/**
 * Money crosses the wire as integer paise and is formatted here. Nothing in the
 * frontend ever does arithmetic on a rupee float.
 */
export function formatMoney(paise: number | null | undefined, currency = 'INR'): string {
  if (paise === null || paise === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

/** Compact form for KPI tiles: 12.4L, 1.8Cr. */
export function formatMoneyCompact(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '—';
  const rupees = paise / 100;
  if (Math.abs(rupees) >= 1e7) return `₹${(rupees / 1e7).toFixed(2)}Cr`;
  if (Math.abs(rupees) >= 1e5) return `₹${(rupees / 1e5).toFixed(2)}L`;
  if (Math.abs(rupees) >= 1e3) return `₹${(rupees / 1e3).toFixed(1)}K`;
  return `₹${rupees.toFixed(0)}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-IN').format(value);
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : phone;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'd MMM yyyy');
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, "d MMM yyyy, h:mm a");
}

/** "Today, 3:30 PM" reads faster than a date when scanning a work queue. */
export function formatRelativeDay(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  const time = format(d, 'h:mm a');
  if (isToday(d)) return `Today, ${time}`;
  if (isTomorrow(d)) return `Tomorrow, ${time}`;
  if (isYesterday(d)) return `Yesterday, ${time}`;
  return format(d, 'd MMM, h:mm a');
}

export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return `${formatDistanceToNowStrict(d)} ago`;
}

export function isOverdue(value: string | Date | null | undefined): boolean {
  if (!value) return false;
  const d = typeof value === 'string' ? new Date(value) : value;
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
}

/** ISO date-only string for query params, in the browser's local timezone. */
export function toDateParam(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}
