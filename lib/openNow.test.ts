import { describe, expect, it } from 'vitest';
import type { WeeklyHours } from './hours';
import {
  CLOSING_SOON_MINUTES,
  closesAt,
  getOpenState,
  isAlwaysOpen,
  isLateNight,
  isOpenAt,
  minutesUntilClose,
  nextOpening,
  toIst,
} from './openNow';

/**
 * Build an instant from an IST wall-clock time. IST is UTC+05:30 year-round
 * (no DST), so the offset can be written literally — and writing it literally
 * is the point: these tests must pass identically under TZ=UTC,
 * TZ=America/New_York and TZ=Asia/Kolkata. `npm run test:tz` runs all three.
 *
 * 2026-08-14 is a Friday; 2026-08-15 a Saturday; 2026-08-16 a Sunday.
 */
function ist(wallClock: string): Date {
  return new Date(`${wallClock}:00+05:30`);
}

const EVERY_DAY_LATE: WeeklyHours = {
  mon: [{ open: '19:00', close: '02:30' }],
  tue: [{ open: '19:00', close: '02:30' }],
  wed: [{ open: '19:00', close: '02:30' }],
  thu: [{ open: '19:00', close: '02:30' }],
  fri: [{ open: '19:00', close: '02:30' }],
  sat: [{ open: '19:00', close: '02:30' }],
  sun: [{ open: '19:00', close: '02:30' }],
};

const FRIDAY_ONLY: WeeklyHours = {
  mon: [],
  tue: [],
  wed: [],
  thu: [],
  fri: [{ open: '19:00', close: '02:30' }],
  sat: [],
  sun: [],
};

const TWENTY_FOUR_SEVEN: WeeklyHours = {
  mon: [{ open: '00:00', close: '24:00' }],
  tue: [{ open: '00:00', close: '24:00' }],
  wed: [{ open: '00:00', close: '24:00' }],
  thu: [{ open: '00:00', close: '24:00' }],
  fri: [{ open: '00:00', close: '24:00' }],
  sat: [{ open: '00:00', close: '24:00' }],
  sun: [{ open: '00:00', close: '24:00' }],
};

const DAYTIME_ONLY: WeeklyHours = {
  mon: [{ open: '11:00', close: '23:00' }],
  tue: [{ open: '11:00', close: '23:00' }],
  wed: [{ open: '11:00', close: '23:00' }],
  thu: [{ open: '11:00', close: '23:00' }],
  fri: [{ open: '11:00', close: '23:00' }],
  sat: [{ open: '11:00', close: '23:00' }],
  sun: [{ open: '11:00', close: '23:00' }],
};

// The Sunday-night-into-Monday case: the week boundary, where naive
// implementations silently report "closed".
const SUNDAY_SPILL: WeeklyHours = {
  sun: [{ open: '23:00', close: '02:30' }],
};

// Lunch and a late dinner service on the same day.
const SPLIT_SHIFT: WeeklyHours = {
  sat: [
    { open: '12:00', close: '15:30' },
    { open: '19:00', close: '03:00' },
  ],
};

describe('toIst', () => {
  it('reads the IST wall clock regardless of the runtime timezone', () => {
    const moment = toIst(new Date('2026-08-14T20:30:00Z')); // 02:00 IST Saturday
    expect(moment.day).toBe('sat');
    expect(moment.minuteOfDay).toBe(120);
    expect(moment.minuteOfWeek).toBe(5 * 1440 + 120);
  });

  it('handles the IST date rolling over before UTC does', () => {
    // 19:00 UTC Friday is already 00:30 Saturday in Mumbai.
    const moment = toIst(new Date('2026-08-14T19:00:00Z'));
    expect(moment.day).toBe('sat');
    expect(moment.minuteOfDay).toBe(30);
  });

  it('puts midnight IST at minute 0, not 1440', () => {
    const moment = toIst(ist('2026-08-15T00:00'));
    expect(moment.day).toBe('sat');
    expect(moment.minuteOfDay).toBe(0);
  });

  it('rejects an invalid date rather than guessing', () => {
    expect(() => toIst(new Date('not a date'))).toThrow(RangeError);
  });
});

describe('isOpenAt — overnight spill (the case this whole app exists for)', () => {
  it('is open at Sat 01:00 on Friday’s 19:00–02:30 window', () => {
    expect(isOpenAt(FRIDAY_ONLY, ist('2026-08-15T01:00'))).toBe(true);
  });

  it('is closed at Sat 03:00 — the Friday window has ended', () => {
    expect(isOpenAt(FRIDAY_ONLY, ist('2026-08-15T03:00'))).toBe(false);
  });

  it('is closed at Sat 20:00 — Saturday itself has no hours', () => {
    expect(isOpenAt(FRIDAY_ONLY, ist('2026-08-15T20:00'))).toBe(false);
  });

  it('is open at Fri 19:00 sharp and Fri 23:59', () => {
    expect(isOpenAt(FRIDAY_ONLY, ist('2026-08-14T19:00'))).toBe(true);
    expect(isOpenAt(FRIDAY_ONLY, ist('2026-08-14T23:59'))).toBe(true);
  });

  it('is closed at Fri 18:59, one minute before opening', () => {
    expect(isOpenAt(FRIDAY_ONLY, ist('2026-08-14T18:59'))).toBe(false);
  });
});

describe('isOpenAt — exact boundaries', () => {
  it('is open at 02:29 and closed at 02:30 sharp', () => {
    expect(isOpenAt(FRIDAY_ONLY, ist('2026-08-15T02:29'))).toBe(true);
    expect(isOpenAt(FRIDAY_ONLY, ist('2026-08-15T02:30'))).toBe(false);
  });

  it('is open at exactly midnight during an overnight window', () => {
    expect(isOpenAt(FRIDAY_ONLY, ist('2026-08-15T00:00'))).toBe(true);
  });
});

describe('isOpenAt — week wraparound (Sunday night into Monday)', () => {
  it('is open at Mon 01:00 on Sunday’s 23:00–02:30 window', () => {
    expect(isOpenAt(SUNDAY_SPILL, ist('2026-08-17T01:00'))).toBe(true);
  });

  it('is closed at Mon 03:00', () => {
    expect(isOpenAt(SUNDAY_SPILL, ist('2026-08-17T03:00'))).toBe(false);
  });

  it('reports the right closing time and no false "overnight" past midnight', () => {
    expect(closesAt(SUNDAY_SPILL, ist('2026-08-17T01:00'))).toEqual({
      time: '02:30',
      overnight: false,
    });
    expect(closesAt(SUNDAY_SPILL, ist('2026-08-16T23:30'))).toEqual({
      time: '02:30',
      overnight: true,
    });
  });

  it('counts down correctly across the week boundary', () => {
    expect(minutesUntilClose(SUNDAY_SPILL, ist('2026-08-17T01:00'))).toBe(90);
  });
});

describe('isOpenAt — 24-hour days and unknown hours', () => {
  it('is always open for a 24×7 place', () => {
    expect(isOpenAt(TWENTY_FOUR_SEVEN, ist('2026-08-15T04:00'))).toBe(true);
    expect(isOpenAt(TWENTY_FOUR_SEVEN, ist('2026-08-15T14:00'))).toBe(true);
    expect(isAlwaysOpen(TWENTY_FOUR_SEVEN)).toBe(true);
  });

  it('does not treat a single 24-hour day as 24×7', () => {
    const mondayOnly: WeeklyHours = { mon: [{ open: '00:00', close: '24:00' }] };
    expect(isAlwaysOpen(mondayOnly)).toBe(false);
    expect(isOpenAt(mondayOnly, ist('2026-08-17T13:00'))).toBe(true); // Monday
    expect(isOpenAt(mondayOnly, ist('2026-08-18T13:00'))).toBe(false); // Tuesday
  });

  it('is NEVER open when hours are unknown', () => {
    expect(isOpenAt(null, ist('2026-08-15T01:00'))).toBe(false);
    expect(isOpenAt(undefined, ist('2026-08-15T01:00'))).toBe(false);
    expect(closesAt(null, ist('2026-08-15T01:00'))).toBeNull();
    expect(minutesUntilClose(null, ist('2026-08-15T01:00'))).toBeNull();
    expect(getOpenState(null, ist('2026-08-15T01:00'))).toEqual({ kind: 'unknown' });
  });

  it('is never open on a day with an empty window list', () => {
    expect(isOpenAt(FRIDAY_ONLY, ist('2026-08-16T21:00'))).toBe(false); // Sunday
  });

  it('ignores malformed windows instead of inventing an open state', () => {
    const broken = { fri: [{ open: '25:00', close: '99:99' }] } as unknown as WeeklyHours;
    expect(isOpenAt(broken, ist('2026-08-14T22:00'))).toBe(false);
    expect(getOpenState(broken, ist('2026-08-14T22:00'))).toEqual({ kind: 'unknown' });
  });
});

describe('isOpenAt — split shifts', () => {
  it('is open during lunch, shut in the gap, open again at night', () => {
    expect(isOpenAt(SPLIT_SHIFT, ist('2026-08-15T13:00'))).toBe(true);
    expect(isOpenAt(SPLIT_SHIFT, ist('2026-08-15T17:00'))).toBe(false);
    expect(isOpenAt(SPLIT_SHIFT, ist('2026-08-15T22:00'))).toBe(true);
    expect(isOpenAt(SPLIT_SHIFT, ist('2026-08-16T02:00'))).toBe(true); // spills to Sunday
    expect(isOpenAt(SPLIT_SHIFT, ist('2026-08-16T03:01'))).toBe(false);
  });

  it('reports the closing time of the window you are actually in', () => {
    expect(closesAt(SPLIT_SHIFT, ist('2026-08-15T13:00'))?.time).toBe('15:30');
    expect(closesAt(SPLIT_SHIFT, ist('2026-08-15T22:00'))?.time).toBe('03:00');
  });
});

describe('closesAt', () => {
  it('marks the close as overnight only when it lands on the next day', () => {
    expect(closesAt(FRIDAY_ONLY, ist('2026-08-14T23:00'))).toEqual({
      time: '02:30',
      overnight: true,
    });
    expect(closesAt(FRIDAY_ONLY, ist('2026-08-15T01:00'))).toEqual({
      time: '02:30',
      overnight: false,
    });
  });

  it('returns null when closed', () => {
    expect(closesAt(FRIDAY_ONLY, ist('2026-08-15T12:00'))).toBeNull();
  });

  it('returns null for a place that never closes', () => {
    expect(closesAt(TWENTY_FOUR_SEVEN, ist('2026-08-15T04:00'))).toBeNull();
  });

  it('chains directly adjacent windows into one continuous stretch', () => {
    // 18:00–06:00 then 06:00–14:00 is one 20-hour stretch, not two.
    const chained: WeeklyHours = {
      fri: [
        { open: '18:00', close: '06:00' },
        { open: '06:00', close: '14:00' },
      ],
      sat: [
        { open: '18:00', close: '06:00' },
        { open: '06:00', close: '14:00' },
      ],
    };
    expect(closesAt(chained, ist('2026-08-14T20:00'))).toEqual({
      time: '14:00',
      overnight: true,
    });
  });
});

describe('minutesUntilClose', () => {
  it('counts down within the window', () => {
    expect(minutesUntilClose(FRIDAY_ONLY, ist('2026-08-15T02:00'))).toBe(30);
    expect(minutesUntilClose(FRIDAY_ONLY, ist('2026-08-14T19:00'))).toBe(450);
  });

  it('returns null when closed or never closing', () => {
    expect(minutesUntilClose(FRIDAY_ONLY, ist('2026-08-15T04:00'))).toBeNull();
    expect(minutesUntilClose(TWENTY_FOUR_SEVEN, ist('2026-08-15T04:00'))).toBeNull();
  });
});

describe('nextOpening', () => {
  it('finds the next opening later the same day', () => {
    expect(nextOpening(FRIDAY_ONLY, ist('2026-08-14T12:00'))).toEqual({
      day: 'fri',
      time: '19:00',
    });
  });

  it('rolls forward to the next week when the only window has passed', () => {
    expect(nextOpening(FRIDAY_ONLY, ist('2026-08-15T04:00'))).toEqual({
      day: 'fri',
      time: '19:00',
    });
  });

  it('returns null when hours are unknown or the place never opens', () => {
    expect(nextOpening(null, ist('2026-08-15T04:00'))).toBeNull();
    expect(nextOpening({ mon: [] }, ist('2026-08-15T04:00'))).toBeNull();
  });

  it('returns null for a place that is never shut', () => {
    expect(nextOpening(TWENTY_FOUR_SEVEN, ist('2026-08-15T04:00'))).toBeNull();
  });
});

describe('isLateNight — the seed filter', () => {
  it('accepts windows that run past midnight', () => {
    expect(isLateNight(EVERY_DAY_LATE)).toBe(true);
    expect(isLateNight(FRIDAY_ONLY)).toBe(true);
    expect(isLateNight(SUNDAY_SPILL)).toBe(true);
    expect(isLateNight(TWENTY_FOUR_SEVEN)).toBe(true);
  });

  it('accepts windows that begin inside the 00:00–06:00 band', () => {
    expect(isLateNight({ sat: [{ open: '01:00', close: '05:00' }] })).toBe(true);
    expect(isLateNight({ sat: [{ open: '05:59', close: '11:00' }] })).toBe(true);
  });

  it('rejects places that shut before midnight — keeps the DB honest', () => {
    expect(isLateNight(DAYTIME_ONLY)).toBe(false);
    expect(isLateNight({ sat: [{ open: '06:00', close: '23:59' }] })).toBe(false);
  });

  it('rejects a place closing at exactly midnight — it is shut at 12 AM', () => {
    expect(isLateNight({ sat: [{ open: '18:00', close: '00:00' }] })).toBe(false);
  });

  it('rejects unknown hours', () => {
    expect(isLateNight(null)).toBe(false);
    expect(isLateNight({})).toBe(false);
  });
});

describe('getOpenState — what the card actually renders', () => {
  it('flags closing soon inside the 45-minute window, not outside it', () => {
    const soon = getOpenState(FRIDAY_ONLY, ist('2026-08-15T02:00'));
    expect(soon).toMatchObject({ kind: 'open', closesAt: '02:30', closingSoon: true });

    const notYet = getOpenState(FRIDAY_ONLY, ist('2026-08-15T01:30'));
    expect(notYet).toMatchObject({ kind: 'open', closingSoon: false });

    const exactlyAtThreshold = getOpenState(
      FRIDAY_ONLY,
      ist(`2026-08-15T0${Math.floor((150 - CLOSING_SOON_MINUTES) / 60)}:45`),
    );
    expect(exactlyAtThreshold).toMatchObject({ closingSoon: true });
  });

  it('reports always_open for 24×7 rather than a bogus midnight close', () => {
    expect(getOpenState(TWENTY_FOUR_SEVEN, ist('2026-08-15T04:00'))).toEqual({
      kind: 'always_open',
    });
  });

  it('reports closed with the next opening', () => {
    expect(getOpenState(FRIDAY_ONLY, ist('2026-08-14T12:00'))).toEqual({
      kind: 'closed',
      next: { day: 'fri', time: '19:00' },
      // Friday noon, opening Friday evening — the UI says "opens 7 PM", not
      // "opens Fri 7 PM", because naming today's day reads as next week.
      nextIsToday: true,
    });
  });

  it('knows when the next opening is on a different day', () => {
    expect(getOpenState(FRIDAY_ONLY, ist('2026-08-15T04:00'))).toEqual({
      kind: 'closed',
      next: { day: 'fri', time: '19:00' },
      nextIsToday: false,
    });
  });
});

describe('the three simulated times from the Phase 3 acceptance criteria', () => {
  const cases: Array<[string, string, 'open' | 'closed' | 'always_open']> = [
    ['2026-08-15T23:00', 'late-night place at 23:00', 'open'],
    ['2026-08-16T01:30', 'late-night place at 01:30', 'open'],
    ['2026-08-16T05:50', 'late-night place at 05:50', 'closed'],
  ];

  it.each(cases)('%s — %s', (when, _label, expected) => {
    expect(getOpenState(EVERY_DAY_LATE, ist(when)).kind).toBe(expected);
  });

  it('a daytime place is shut at all three times', () => {
    for (const [when] of cases) {
      expect(isOpenAt(DAYTIME_ONLY, ist(when))).toBe(false);
    }
  });
});
