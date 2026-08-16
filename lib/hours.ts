import { z } from 'zod';
import { parseHhMm } from './format';

/**
 * The normalized weekly-hours format — the single source of truth for when a
 * place is open (docs/02). Raw OSM `opening_hours` strings are parsed into this
 * at seed time and never stored.
 *
 *   { "mon": [{ "open": "19:00", "close": "02:30" }], "sun": [] }
 *
 * - `close <= open` means the window crosses midnight into the next day.
 * - `[{ "open": "00:00", "close": "24:00" }]` is a full 24-hour day.
 * - `[]` means closed that day.
 * - A missing day key is treated as closed.
 * - `hours = null` on a place means UNKNOWN. Such a place is never shown as
 *   "open now" — it is surfaced honestly as "hours unverified".
 */

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export const DAY_SHORT: Record<DayKey, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

const hhmm = z.string().refine((value) => parseHhMm(value) !== null, {
  message: 'Expected a 24-hour time as HH:MM (00:00–24:00)',
});

export const hoursWindowSchema = z
  .object({
    open: hhmm,
    close: hhmm,
  })
  .strict()
  .refine((window) => parseHhMm(window.open) !== 1440, {
    message: '24:00 is an end-of-day marker and cannot be an opening time',
    path: ['open'],
  });

export type HoursWindow = z.infer<typeof hoursWindowSchema>;

export const weeklyHoursSchema = z
  .object({
    mon: z.array(hoursWindowSchema).optional(),
    tue: z.array(hoursWindowSchema).optional(),
    wed: z.array(hoursWindowSchema).optional(),
    thu: z.array(hoursWindowSchema).optional(),
    fri: z.array(hoursWindowSchema).optional(),
    sat: z.array(hoursWindowSchema).optional(),
    sun: z.array(hoursWindowSchema).optional(),
  })
  .strict();

export type WeeklyHours = z.infer<typeof weeklyHoursSchema>;

/** Nullable form, matching the `places.hours` column exactly. */
export const nullableWeeklyHoursSchema = weeklyHoursSchema.nullable();

/**
 * Length of a window in minutes, resolving the cross-midnight convention.
 * `close <= open` wraps to the next day; `open === close` is a full 24 hours
 * (matching the OSM "00:00-24:00" idiom). Returns null for malformed input.
 */
export function windowDuration(window: HoursWindow): number | null {
  const open = parseHhMm(window.open);
  const close = parseHhMm(window.close);
  if (open === null || close === null || open === 1440) return null;
  const duration = close > open ? close - open : close + 1440 - open;
  return duration > 0 ? duration : 1440;
}

/** True when the window runs past midnight into the following day. */
export function windowIsOvernight(window: HoursWindow): boolean {
  const open = parseHhMm(window.open);
  const duration = windowDuration(window);
  if (open === null || duration === null) return false;
  return open + duration > 1440;
}

/** Windows for a day, tolerating missing keys. */
export function windowsFor(hours: WeeklyHours, day: DayKey): HoursWindow[] {
  return hours[day] ?? [];
}
