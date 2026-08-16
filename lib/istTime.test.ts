import { describe, expect, it } from 'vitest';
import { formatDateIst, formatDateTimeIst, relativeToNow } from './istTime';

/**
 * These assertions must hold no matter what `TZ` the runtime has. `npm run
 * test:tz` runs the suite under UTC, America/New_York and Asia/Kolkata; a
 * formatter that leaked the local zone would fail two of the three.
 */
describe('formatDateTimeIst', () => {
  it('renders a UTC timestamp in IST, not the runtime zone', () => {
    // 2026-08-15T20:15:00Z is 16 Aug, 1:45 am in Mumbai.
    const text = formatDateTimeIst('2026-08-15T20:15:00.000Z');
    expect(text).toContain('16 Aug');
    expect(text).toMatch(/1:45/);
    expect(text.toLowerCase()).toContain('am');
  });

  it('puts a late-night submission on the right calendar day', () => {
    // The whole product is about 12 AM–6 AM, so this is the case that matters:
    // 18:40Z on the 15th is 00:10 IST on the 16th.
    expect(formatDateIst('2026-08-15T18:40:00.000Z')).toContain('16 Aug');
  });

  it('falls back to the raw value rather than showing "Invalid Date"', () => {
    expect(formatDateTimeIst('not a date')).toBe('not a date');
    expect(formatDateTimeIst(null)).toBe('—');
  });
});

describe('relativeToNow', () => {
  const now = new Date('2026-08-16T12:00:00.000Z');

  it('describes recent things coarsely', () => {
    expect(relativeToNow('2026-08-16T11:59:40.000Z', now)).toBe('just now');
    expect(relativeToNow('2026-08-16T11:20:00.000Z', now)).toBe('40 min ago');
    expect(relativeToNow('2026-08-16T06:00:00.000Z', now)).toBe('6 hr ago');
  });

  it('switches to days and months', () => {
    expect(relativeToNow('2026-08-13T12:00:00.000Z', now)).toBe('3 days ago');
    expect(relativeToNow('2026-08-15T12:00:00.000Z', now)).toBe('1 day ago');
    expect(relativeToNow('2026-06-16T12:00:00.000Z', now)).toBe('2 months ago');
  });
});
