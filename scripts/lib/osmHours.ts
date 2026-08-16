import OpeningHours from 'opening_hours';
import { DAY_KEYS, type DayKey, type HoursWindow, type WeeklyHours } from '@/lib/hours';
import { toHhMm } from '@/lib/format';

/**
 * Turns an OSM `opening_hours` string into our normalized weekly JSONB
 * (docs/03). Raw OSM strings are never stored — they are a wire format, not a
 * data model, and half of them in Mumbai are subtly malformed anyway.
 *
 * ## Why this is done by evaluation rather than parsing
 *
 * `opening_hours` syntax is a small language: `Mo-Th 19:00-01:00; Fr-Sa
 * 19:00-03:00; Su off`, `24/7`, `sunset-sunrise`, month ranges, week numbers.
 * Reimplementing it would be a bug farm. Instead we hand the string to the
 * reference implementation and ask it when the place is actually open across
 * one reference week, then read the answer back out.
 *
 * ## Timezone safety
 *
 * The library evaluates against JavaScript local time. Rather than fight that,
 * the reference week is built with the *local* Date constructor, so the wall
 * clock it sees is exactly the wall clock we intend, whatever `TZ` says. Times
 * are then read back with local getters and day offsets are computed from
 * calendar dates rather than millisecond arithmetic, so a DST transition in the
 * runner's timezone cannot shift a window. The output is timezone-free —
 * "19:00" means 19:00 in Mumbai, which is the only place these hours apply.
 */

const MINUTES_PER_DAY = 1440;
const MINUTES_PER_WEEK = MINUTES_PER_DAY * 7;

/** 1 Jan 2024 was a Monday. */
function referenceMonday(): Date {
  return new Date(2024, 0, 1, 0, 0, 0, 0);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

/** Whole days between two dates, immune to DST making a day 23 or 25 hours. */
function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

function minuteOfReferenceWeek(reference: Date, date: Date): number {
  return (
    calendarDaysBetween(reference, date) * MINUTES_PER_DAY +
    date.getHours() * 60 +
    date.getMinutes()
  );
}

export interface ParseResult {
  hours: WeeklyHours | null;
  /** Why we gave up, for the seed report. */
  reason?: 'empty' | 'unparseable' | 'never-open';
}

/**
 * Detects the fingerprint of OSM's rule-override semantics.
 *
 * In `opening_hours` syntax a later rule replaces earlier ones for the days it
 * names — *including* time that spilled in past midnight from the day before.
 * So `Mo-Th 18:00-01:00; Fr-Sa 18:00-03:00; Su 18:00-01:00` evaluates with
 * Thursday closing at 00:00, not 01:00, because Friday has its own rule. The
 * reference implementation is right by the spec; the person who typed the tag
 * almost certainly meant "Thursday till 1 AM".
 *
 * We keep the spec-correct answer — under-stating a closing time is the safe
 * direction for a product that promises "if we say open, it's open" — but a
 * window ending at exactly midnight is a strong hint that this happened, so the
 * seed report surfaces those rows for the owner to verify first.
 */
export function hasMidnightTruncation(hours: WeeklyHours | null): boolean {
  if (!hours) return false;
  return DAY_KEYS.some((day) =>
    (hours[day] ?? []).some((window) => window.close === '00:00' && window.open !== '00:00'),
  );
}

/**
 * Parse an OSM `opening_hours` value. Returns `{ hours: null, reason }` for
 * anything we cannot read with confidence — an unparseable string must become
 * "hours unverified", never a guess.
 */
export function parseOsmOpeningHours(raw: string | null | undefined): ParseResult {
  const value = raw?.trim();
  if (!value) return { hours: null, reason: 'empty' };

  let evaluator: OpeningHours;
  try {
    // mode 0 = opening hours only, ignoring "lit" / lighting rules.
    evaluator = new OpeningHours(value, undefined, {
      mode: 0,
      tag_key: undefined,
      map_value: undefined,
      warnings_severity: undefined,
      locale: undefined,
    });
  } catch {
    return { hours: null, reason: 'unparseable' };
  }

  const reference = referenceMonday();
  // Look one day back so a window spilling in from the previous Sunday is
  // recognised and discarded rather than clipped into a fake Monday 00:00 open,
  // and one day forward so the real Sunday-night window is not truncated.
  const from = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() - 1);
  const to = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + 8);

  let intervals: Array<[Date, Date, boolean, string | undefined]>;
  try {
    intervals = evaluator.getOpenIntervals(from, to);
  } catch {
    return { hours: null, reason: 'unparseable' };
  }

  if (intervals.length === 0) return { hours: null, reason: 'never-open' };

  const byDay: Record<DayKey, HoursWindow[]> = {
    mon: [],
    tue: [],
    wed: [],
    thu: [],
    fri: [],
    sat: [],
    sun: [],
  };

  let sawAnyWindow = false;

  for (const [start, end] of intervals) {
    const startMinute = minuteOfReferenceWeek(reference, start);
    const endMinute = minuteOfReferenceWeek(reference, end);
    const length = endMinute - startMinute;
    if (length <= 0) continue;

    // Continuously open all week (`24/7`, or a rule that never closes).
    if (length >= MINUTES_PER_WEEK) return { hours: allDayEveryDay() };

    // Windows that began before our reference Monday belong to the previous
    // week's Sunday; the real one is picked up at the end of the range.
    if (startMinute < 0) continue;
    if (startMinute >= MINUTES_PER_WEEK) continue;

    let cursor = startMinute;
    let remaining = length;

    // A window longer than a day (e.g. "Mo-We 00:00-24:00") is emitted as one
    // full day per calendar day. The open-now engine chains adjacent windows
    // back together, so nothing is lost — but the week table on the detail page
    // reads the way a person would write it.
    while (remaining > 0) {
      const dayIndex = Math.floor(cursor / MINUTES_PER_DAY) % 7;
      const openMinute = cursor % MINUTES_PER_DAY;
      const capacity = MINUTES_PER_DAY - openMinute;
      const chunk = remaining > MINUTES_PER_DAY ? Math.min(capacity, remaining) : remaining;

      const dayKey = DAY_KEYS[dayIndex];
      if (dayKey) {
        const closeMinute = openMinute + chunk;
        byDay[dayKey].push({
          open: toHhMm(openMinute),
          close:
            closeMinute === MINUTES_PER_DAY && openMinute === 0
              ? '24:00'
              : toHhMm(closeMinute % MINUTES_PER_DAY),
        });
        sawAnyWindow = true;
      }

      cursor += chunk;
      remaining -= chunk;
    }
  }

  if (!sawAnyWindow) return { hours: null, reason: 'never-open' };

  const hours: WeeklyHours = {};
  for (const day of DAY_KEYS) {
    hours[day] = dedupe(byDay[day]).sort((a, b) => a.open.localeCompare(b.open));
  }

  return { hours };
}

function dedupe(windows: HoursWindow[]): HoursWindow[] {
  const seen = new Set<string>();
  return windows.filter((window) => {
    const key = `${window.open}-${window.close}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function allDayEveryDay(): WeeklyHours {
  return {
    mon: [{ open: '00:00', close: '24:00' }],
    tue: [{ open: '00:00', close: '24:00' }],
    wed: [{ open: '00:00', close: '24:00' }],
    thu: [{ open: '00:00', close: '24:00' }],
    fri: [{ open: '00:00', close: '24:00' }],
    sat: [{ open: '00:00', close: '24:00' }],
    sun: [{ open: '00:00', close: '24:00' }],
  };
}
