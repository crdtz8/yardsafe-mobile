// Plain calendar dates ("2026-11-17") must be read and written in the phone's
// local time. new Date('2026-11-17') is UTC midnight, which is the evening
// BEFORE in the US, and toISOString() rolls over to tomorrow after ~7–8 pm.

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a plain date as local midnight; anything else (timestamps) as usual. */
export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  if (PLAIN_DATE.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Local YYYY-MM-DD for a Date. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Today's local date as YYYY-MM-DD. */
export const todayISO = (): string => toISODate(new Date());

/** YYYY-MM-DD that is `days` after `from` (a plain date string or a Date). */
export function addDaysISO(from: string | Date, days: number): string {
  const base = typeof from === 'string' ? parseDate(from) : new Date(from);
  const d = base ?? new Date();
  return toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}

/** Whole calendar days from today to `s` (0 = today, negative = past). */
export function daysUntil(s: string | null | undefined): number | null {
  const d = parseDate(s);
  if (!d) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/** Display a date (plain or timestamp) in the phone's format; '' if missing. */
export function formatDate(s: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  const d = parseDate(s);
  return d ? d.toLocaleDateString(undefined, opts) : '';
}
