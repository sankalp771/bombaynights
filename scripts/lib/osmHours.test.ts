import { describe, expect, it } from 'vitest';
import { hasMidnightTruncation, parseOsmOpeningHours } from './osmHours';
import { isLateNight, isOpenAt } from '@/lib/openNow';

function ist(wallClock: string): Date {
  return new Date(`${wallClock}:00+05:30`);
}

describe('parseOsmOpeningHours', () => {
  it('parses a plain every-day overnight rule', () => {
    const { hours } = parseOsmOpeningHours('Mo-Su 19:00-02:30');
    expect(hours?.fri).toEqual([{ open: '19:00', close: '02:30' }]);
    expect(hours?.sun).toEqual([{ open: '19:00', close: '02:30' }]);
    // 2026-08-14 is a Friday; the Friday window must still be open at Sat 01:00.
    expect(isOpenAt(hours, ist('2026-08-15T01:00'))).toBe(true);
    expect(isOpenAt(hours, ist('2026-08-15T03:00'))).toBe(false);
  });

  it('parses different weekday and weekend rules', () => {
    const { hours } = parseOsmOpeningHours('Mo-Th 19:00-01:00; Fr-Sa 19:00-03:00; Su off');
    expect(hours?.mon).toEqual([{ open: '19:00', close: '01:00' }]);
    expect(hours?.fri).toEqual([{ open: '19:00', close: '03:00' }]);
    expect(hours?.sun).toEqual([]);
  });

  it('parses 24/7', () => {
    const { hours } = parseOsmOpeningHours('24/7');
    for (const day of ['mon', 'wed', 'sun'] as const) {
      expect(hours?.[day]).toEqual([{ open: '00:00', close: '24:00' }]);
    }
    expect(isOpenAt(hours, ist('2026-08-15T04:00'))).toBe(true);
  });

  it('parses split shifts on one day', () => {
    const { hours } = parseOsmOpeningHours('Mo 12:00-15:30,19:00-23:00');
    expect(hours?.mon).toEqual([
      { open: '12:00', close: '15:30' },
      { open: '19:00', close: '23:00' },
    ]);
  });

  it('does not clip the Sunday-night window at the week boundary', () => {
    const { hours } = parseOsmOpeningHours('Su 23:00-02:30');
    expect(hours?.sun).toEqual([{ open: '23:00', close: '02:30' }]);
    // And it must not leave a phantom Monday 00:00 window from the spill-in.
    expect(hours?.mon).toEqual([]);
    expect(isOpenAt(hours, ist('2026-08-17T01:00'))).toBe(true); // Monday 01:00
  });

  it('expands a multi-day always-open range into whole days', () => {
    const { hours } = parseOsmOpeningHours('Mo-We 00:00-24:00; Th-Su off');
    expect(hours?.mon).toEqual([{ open: '00:00', close: '24:00' }]);
    expect(hours?.wed).toEqual([{ open: '00:00', close: '24:00' }]);
    expect(hours?.thu).toEqual([]);
  });

  it('keeps late-night classification intact through the round trip', () => {
    expect(isLateNight(parseOsmOpeningHours('Mo-Su 19:00-02:30').hours)).toBe(true);
    expect(isLateNight(parseOsmOpeningHours('Mo-Su 11:00-22:00').hours)).toBe(false);
    expect(isLateNight(parseOsmOpeningHours('24/7').hours)).toBe(true);
  });

  it('reports why it gave up instead of guessing', () => {
    expect(parseOsmOpeningHours('')).toEqual({ hours: null, reason: 'empty' });
    expect(parseOsmOpeningHours(null)).toEqual({ hours: null, reason: 'empty' });
    expect(parseOsmOpeningHours('   ')).toEqual({ hours: null, reason: 'empty' });

    const nonsense = parseOsmOpeningHours('whenever the owner feels like it');
    expect(nonsense.hours).toBeNull();
    expect(nonsense.reason).toBeDefined();
  });

  it('follows OSM rule-override semantics, and flags the result for review', () => {
    // Per the opening_hours spec a later rule replaces spill-over from the day
    // before, so Thursday closes at midnight rather than 01:00 and Saturday at
    // midnight rather than 03:00. This is the spec-correct reading, and it
    // under-states rather than over-states — the safe direction. The flag tells
    // the seed report to put these in front of the owner first.
    const { hours } = parseOsmOpeningHours('Mo-Th 18:00-01:00; Fr-Sa 18:00-03:00; Su 18:00-01:00');
    expect(hours?.wed).toEqual([{ open: '18:00', close: '01:00' }]);
    expect(hours?.thu).toEqual([{ open: '18:00', close: '00:00' }]);
    expect(hours?.fri).toEqual([{ open: '18:00', close: '03:00' }]);
    expect(hours?.sat).toEqual([{ open: '18:00', close: '00:00' }]);
    expect(hasMidnightTruncation(hours)).toBe(true);
  });

  it('does not flag rules with no boundary to be overridden', () => {
    expect(hasMidnightTruncation(parseOsmOpeningHours('Mo-Su 19:00-02:30').hours)).toBe(false);
    expect(hasMidnightTruncation(parseOsmOpeningHours('Fr-Sa 18:00-03:00').hours)).toBe(false);
    expect(hasMidnightTruncation(parseOsmOpeningHours('24/7').hours)).toBe(false);
    expect(hasMidnightTruncation(null)).toBe(false);
  });

  it('treats an always-closed rule as unknown, not as open', () => {
    const result = parseOsmOpeningHours('off');
    expect(result.hours).toBeNull();
    expect(isOpenAt(result.hours, ist('2026-08-15T01:00'))).toBe(false);
  });
});
