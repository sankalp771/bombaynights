import { DAY_KEYS, windowDuration, windowsFor, type DayKey, type WeeklyHours } from './hours';
import { toHhMm } from './format';

/**
 * The open-now engine. Every computation here happens in **Asia/Kolkata**,
 * regardless of where the server or the visitor's browser thinks it is. That is
 * non-negotiable (CLAUDE.md) and it is the single biggest correctness risk in
 * this app: a place open Fri 19:00–02:30 is genuinely open at Sat 01:00, and a
 * naive local-time check gets that wrong in both directions.
 *
 * Everything below is pure. No I/O, no `Date.now()` defaults that hide bugs in
 * tests — callers pass the instant they mean.
 *
 * ## Model
 *
 * The week is a circle of 10,080 minutes starting at Monday 00:00 IST. Each
 * opening window becomes an interval `[start, start + duration)` on that
 * circle. Windows that cross midnight simply run past the day boundary, and
 * Sunday-night windows wrap around to Monday. Containment tests compare against
 * both `t` and `t + WEEK` so the wrap needs no special-casing.
 */

const IST_TIME_ZONE = 'Asia/Kolkata';
const DAY = 1440;
const WEEK = DAY * 7;

/** ≤ this many minutes left and the UI shows the amber "closing soon" state. */
export const CLOSING_SOON_MINUTES = 45;

export interface IstMoment {
  /** Day of week in IST. */
  day: DayKey;
  /** Minutes since midnight IST, 0–1439. */
  minuteOfDay: number;
  /** Minutes since Monday 00:00 IST, 0–10079. */
  minuteOfWeek: number;
}

const istFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: IST_TIME_ZONE,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const WEEKDAY_TO_KEY: Record<string, DayKey> = {
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
  Sun: 'sun',
};

/**
 * Convert any instant to its IST day + minute. Uses `Intl` parts rather than
 * `Date` getters, so `TZ=UTC`, `TZ=America/New_York` and a phone in another
 * timezone all produce identical answers.
 */
export function toIst(date: Date): IstMoment {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('toIst received an invalid Date');
  }

  let weekday = '';
  let hour = 0;
  let minute = 0;

  for (const part of istFormatter.formatToParts(date)) {
    if (part.type === 'weekday') weekday = part.value;
    else if (part.type === 'hour') hour = Number(part.value);
    else if (part.type === 'minute') minute = Number(part.value);
  }

  const day = WEEKDAY_TO_KEY[weekday];
  if (!day) {
    throw new RangeError(`Could not read an IST weekday from "${weekday}"`);
  }

  // Some ICU builds render midnight as hour 24 under h23; normalize defensively.
  const minuteOfDay = (hour % 24) * 60 + minute;
  const dayIndex = DAY_KEYS.indexOf(day);

  return { day, minuteOfDay, minuteOfWeek: dayIndex * DAY + minuteOfDay };
}

/** Current IST moment. Kept separate so every other function stays pure. */
export function istNow(now: Date = new Date()): IstMoment {
  return toIst(now);
}

interface Interval {
  /** Minutes since Monday 00:00 IST. */
  start: number;
  /** Exclusive end; may exceed WEEK when the window wraps past Sunday. */
  end: number;
}

/**
 * Flatten weekly hours into circular intervals. Malformed windows are dropped
 * rather than guessed at — bad data must never manufacture an "open now".
 */
function toIntervals(hours: WeeklyHours | null | undefined): Interval[] {
  if (!hours) return [];
  const intervals: Interval[] = [];

  DAY_KEYS.forEach((day, dayIndex) => {
    for (const window of windowsFor(hours, day)) {
      const duration = windowDuration(window);
      if (duration === null) continue;
      const openMinutes = parseOpen(window.open);
      if (openMinutes === null) continue;
      intervals.push({
        start: dayIndex * DAY + openMinutes,
        end: dayIndex * DAY + openMinutes + duration,
      });
    }
  });

  return intervals.sort((a, b) => a.start - b.start);
}

function parseOpen(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** Does the interval contain this minute-of-week, accounting for wraparound? */
function contains(interval: Interval, minuteOfWeek: number): boolean {
  return (
    (minuteOfWeek >= interval.start && minuteOfWeek < interval.end) ||
    (minuteOfWeek + WEEK >= interval.start && minuteOfWeek + WEEK < interval.end)
  );
}

function activeInterval(intervals: Interval[], minuteOfWeek: number): Interval | null {
  for (const interval of intervals) {
    if (contains(interval, minuteOfWeek)) return interval;
  }
  return null;
}

/** Normalize a minute-of-week that may have run past Sunday midnight. */
function wrap(minuteOfWeek: number): number {
  return ((minuteOfWeek % WEEK) + WEEK) % WEEK;
}

/**
 * Walk forward through directly adjacent windows so a place that lists
 * 00:00–24:00 every day (or 18:00–06:00 followed by 06:00–14:00) is understood
 * as continuously open rather than "closing at midnight" seven times a week.
 *
 * Returns the real end of the continuous stretch, or `null` if the stretch
 * closes the loop — i.e. the place never shuts.
 */
function continuousEnd(intervals: Interval[], from: Interval): number | null {
  let end = from.end;
  // One pass per interval is enough; more means we have looped.
  for (let step = 0; step <= intervals.length; step += 1) {
    const next = intervals.find((candidate) => wrap(candidate.start) === wrap(end));
    if (!next) return end;
    end += next.end - next.start;
    if (end - from.start >= WEEK) return null;
  }
  return null;
}

/** True when the hours describe an unbroken 24×7 operation. */
export function isAlwaysOpen(hours: WeeklyHours | null | undefined): boolean {
  const intervals = toIntervals(hours);
  const first = intervals[0];
  if (!first) return false;
  return continuousEnd(intervals, first) === null;
}

/**
 * Is the place open at this instant, in IST?
 *
 * Unknown hours (`null`) are never "open" — we would rather say nothing than
 * send someone across the city on a guess.
 */
export function isOpenAt(hours: WeeklyHours | null | undefined, date: Date): boolean {
  const intervals = toIntervals(hours);
  if (intervals.length === 0) return false;
  return activeInterval(intervals, toIst(date).minuteOfWeek) !== null;
}

export interface ClosesAt {
  /** "02:30" — the closing time in IST. */
  time: string;
  /** True when that closing time falls on the day after the window opened. */
  overnight: boolean;
}

/**
 * When does the currently-open stretch end? `null` when the place is closed
 * right now, or when it never closes (check `isAlwaysOpen` to tell them apart —
 * or just use `getOpenState`, which does it for you).
 */
export function closesAt(hours: WeeklyHours | null | undefined, date: Date): ClosesAt | null {
  const intervals = toIntervals(hours);
  const moment = toIst(date);
  const active = activeInterval(intervals, moment.minuteOfWeek);
  if (!active) return null;

  const end = continuousEnd(intervals, active);
  if (end === null) return null;

  // `now` may sit in the wrapped tail of a Sunday-night window; compare on the
  // same revolution as the interval so "overnight" is measured honestly.
  const nowOnSameRevolution =
    moment.minuteOfWeek >= active.start ? moment.minuteOfWeek : moment.minuteOfWeek + WEEK;

  return {
    time: toHhMm(end % DAY),
    overnight: Math.floor(end / DAY) > Math.floor(nowOnSameRevolution / DAY),
  };
}

/**
 * Minutes remaining until the place shuts. `null` when it is closed now or
 * never closes.
 */
export function minutesUntilClose(
  hours: WeeklyHours | null | undefined,
  date: Date,
): number | null {
  const intervals = toIntervals(hours);
  const moment = toIst(date);
  const active = activeInterval(intervals, moment.minuteOfWeek);
  if (!active) return null;

  const end = continuousEnd(intervals, active);
  if (end === null) return null;

  const nowOnSameRevolution =
    moment.minuteOfWeek >= active.start ? moment.minuteOfWeek : moment.minuteOfWeek + WEEK;

  return Math.max(0, end - nowOnSameRevolution);
}

export interface NextOpening {
  day: DayKey;
  time: string;
}

/**
 * The next time this place opens after the given instant. Used for the
 * "Opens 7 PM" state. `null` when the hours are unknown or the place is never
 * open.
 */
export function nextOpening(
  hours: WeeklyHours | null | undefined,
  date: Date,
): NextOpening | null {
  const intervals = toIntervals(hours);
  if (intervals.length === 0) return null;
  if (isAlwaysOpen(hours)) return null;

  const now = toIst(date).minuteOfWeek;
  let best: number | null = null;

  for (const interval of intervals) {
    const distance = wrap(wrap(interval.start) - now);
    if (best === null || distance < best) best = distance;
  }

  if (best === null) return null;

  const absolute = wrap(now + best);
  const dayKey = DAY_KEYS[Math.floor(absolute / DAY)];
  if (!dayKey) return null;

  return { day: dayKey, time: toHhMm(absolute % DAY) };
}

/**
 * Does ANY window touch the 00:00–06:00 band on ANY day? This is the definition
 * of "late night" for this product — it drives the OSM seed filter (docs/03)
 * and the badge. A place closing at exactly midnight is not late-night: it is
 * shut at 12:00 AM.
 */
export function isLateNight(hours: WeeklyHours | null | undefined): boolean {
  if (!hours) return false;

  for (const day of DAY_KEYS) {
    for (const window of windowsFor(hours, day)) {
      const duration = windowDuration(window);
      const open = parseOpen(window.open);
      if (duration === null || open === null) continue;
      // Either the window starts inside the band, or it runs past midnight
      // into it.
      if (open < 360 || open + duration > DAY) return true;
    }
  }

  return false;
}

/**
 * One call for the UI. Everything the card and detail page need to render an
 * honest status line.
 */
export type OpenState =
  | { kind: 'unknown' }
  | { kind: 'always_open' }
  | { kind: 'open'; closesAt: string; overnight: boolean; minutesLeft: number; closingSoon: boolean }
  | { kind: 'closed'; next: NextOpening | null };

export function getOpenState(hours: WeeklyHours | null | undefined, date: Date): OpenState {
  if (!hours || toIntervals(hours).length === 0) return { kind: 'unknown' };
  if (!isOpenAt(hours, date)) return { kind: 'closed', next: nextOpening(hours, date) };
  if (isAlwaysOpen(hours)) return { kind: 'always_open' };

  const closing = closesAt(hours, date);
  const minutesLeft = minutesUntilClose(hours, date);
  if (!closing || minutesLeft === null) return { kind: 'always_open' };

  return {
    kind: 'open',
    closesAt: closing.time,
    overnight: closing.overnight,
    minutesLeft,
    closingSoon: minutesLeft <= CLOSING_SOON_MINUTES,
  };
}
