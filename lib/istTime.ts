/**
 * Timestamp display, always in `Asia/Kolkata`.
 *
 * `format.ts` is deliberately timezone-free and `openNow.ts` is the open/closed
 * engine; this is the third thing — turning a stored ISO timestamp into
 * something the owner reads in the admin. It lives apart so nobody is tempted
 * to reach for `toLocaleString()` with the runtime's zone, which on Vercel is
 * UTC and would quietly date every submission wrong by five and a half hours.
 */

const IST_TIME_ZONE = 'Asia/Kolkata';

const DATE_TIME = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const DATE_ONLY = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** "16 Aug, 1:30 am" — or the raw value if it is not a parseable timestamp. */
export function formatDateTimeIst(value: string | null | undefined): string {
  const date = toDate(value);
  return date ? DATE_TIME.format(date) : (value ?? '—');
}

/** "16 Aug 2026" */
export function formatDateIst(value: string | null | undefined): string {
  const date = toDate(value);
  return date ? DATE_ONLY.format(date) : (value ?? '—');
}

/** "3 days ago" / "just now". Coarse on purpose — the queue is not a stopwatch. */
export function relativeToNow(value: string | null | undefined, now: Date = new Date()): string {
  const date = toDate(value);
  if (!date) return '—';

  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;

  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
