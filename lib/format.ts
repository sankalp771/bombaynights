/**
 * Display formatting helpers. Pure, no dates, no timezones — these take the
 * canonical "HH:MM" strings used in the `hours` JSONB and turn them into the
 * copy we actually show ("3:30 AM"). Timezone-aware logic lives in openNow.ts.
 */

const HHMM = /^(\d{2}):(\d{2})$/;

/** Parse "HH:MM" (00:00–24:00) to minutes since midnight, or null if malformed. */
export function parseHhMm(value: string): number | null {
  const match = HHMM.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (minutes > 59) return null;
  // 24:00 is the canonical "end of day" marker; 24:01+ is not valid.
  if (hours > 24 || (hours === 24 && minutes !== 0)) return null;
  return hours * 60 + minutes;
}

/** Minutes since midnight → "HH:MM". Values ≥ 1440 wrap to the next day. */
export function toHhMm(minutes: number): string {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * "02:30" → "2:30 AM". Bombay reads times in 12-hour form; midnight is
 * "12 AM" and noon is "12 PM". Whole hours drop the ":00" — "3 AM", not
 * "3:00 AM" — because that is how people say it.
 */
export function formatTime(value: string): string {
  const total = parseHhMm(value);
  if (total === null) return value;
  if (total === 1440) return '12 AM';
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "1 hr 20 min" / "45 min" / "under a minute" — for "closing soon" copy. */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 1) return 'under a minute';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return h === 1 ? '1 hr' : `${h} hrs`;
  return `${h} hr ${m} min`;
}

/** Slug for a place: "Bademiya" + "Fort–Colaba" → "bademiya-fort-colaba". */
export function slugify(...parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}
