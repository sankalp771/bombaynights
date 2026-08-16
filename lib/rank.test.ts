import { describe, expect, it } from 'vitest';
import { closingLatest, countOpenNow, rankPlaces } from './rank';
import type { PublicPlace } from './types';
import type { WeeklyHours } from './hours';

function ist(wallClock: string): Date {
  return new Date(`${wallClock}:00+05:30`);
}

const everyDay = (open: string, close: string): WeeklyHours => ({
  mon: [{ open, close }],
  tue: [{ open, close }],
  wed: [{ open, close }],
  thu: [{ open, close }],
  fri: [{ open, close }],
  sat: [{ open, close }],
  sun: [{ open, close }],
});

function place(overrides: Partial<PublicPlace> & Pick<PublicPlace, 'slug' | 'name'>): PublicPlace {
  return {
    id: overrides.slug,
    area_id: 1,
    address: null,
    lat: 19.06,
    lng: 72.83,
    categories: [],
    food_type: 'unknown',
    serves_alcohol: null,
    has_shisha: null,
    service_modes: [],
    hours: null,
    hours_verified: false,
    price_band: null,
    phone: null,
    notes: null,
    last_call: null,
    verified_at: null,
    ...overrides,
  } as PublicPlace;
}

// Saturday 2026-08-15, 01:00 IST.
const NOW = ist('2026-08-16T01:00');

const tillFour = place({ slug: 'till-four', name: 'Till Four', hours: everyDay('19:00', '04:00') });
const tillTwo = place({ slug: 'till-two', name: 'Till Two', hours: everyDay('19:00', '02:00') });
const allNight = place({
  slug: 'all-night',
  name: 'All Night',
  hours: everyDay('00:00', '24:00'),
});
const shut = place({ slug: 'shut', name: 'Shut', hours: everyDay('11:00', '22:00') });
const unknownHours = place({ slug: 'unknown', name: 'Unknown Hours', hours: null });

const ALL = [shut, tillTwo, unknownHours, tillFour, allNight];

describe('rankPlaces ordering', () => {
  it('puts open places first, then the ones closing latest', () => {
    const ranked = rankPlaces(ALL, { now: NOW });
    expect(ranked.map((entry) => entry.place.slug)).toEqual([
      'all-night', // never closes
      'till-four', // 3 hours left
      'till-two', // 1 hour left
      'unknown', // hours unverified — behind anything we can vouch for
      'shut',
    ]);
  });

  it('breaks ties by distance when the visitor shared location', () => {
    const near = place({
      slug: 'near',
      name: 'Near',
      hours: everyDay('19:00', '04:00'),
      lat: 19.06,
      lng: 72.83,
    });
    const far = place({
      slug: 'far',
      name: 'Far',
      hours: everyDay('19:00', '04:00'),
      lat: 19.2,
      lng: 72.85,
    });
    const ranked = rankPlaces([far, near], { now: NOW, origin: { lat: 19.06, lng: 72.83 } });
    expect(ranked.map((entry) => entry.place.slug)).toEqual(['near', 'far']);
    expect(ranked[0]?.distanceMetres).toBeLessThan(100);
  });

  it('falls back to name when nothing else separates two places', () => {
    const a = place({ slug: 'a', name: 'Anda Pav', hours: everyDay('19:00', '04:00') });
    const b = place({ slug: 'b', name: 'Bun Maska', hours: everyDay('19:00', '04:00') });
    const ranked = rankPlaces([b, a], { now: NOW });
    expect(ranked.map((entry) => entry.place.name)).toEqual(['Anda Pav', 'Bun Maska']);
  });

  it('leaves distance null when the visitor did not share location', () => {
    expect(rankPlaces(ALL, { now: NOW })[0]?.distanceMetres).toBeNull();
  });
});

describe('rankPlaces filtering', () => {
  it('openOnly drops closed and unknown-hours places', () => {
    const ranked = rankPlaces(ALL, { now: NOW, openOnly: true });
    expect(ranked.map((entry) => entry.place.slug)).toEqual(['all-night', 'till-four', 'till-two']);
  });

  it('AND-combines tags', () => {
    const shishaBar = place({
      slug: 'shisha-bar',
      name: 'Shisha Bar',
      hours: everyDay('19:00', '03:00'),
      categories: ['bar', 'shisha_lounge'],
    });
    const plainBar = place({
      slug: 'plain-bar',
      name: 'Plain Bar',
      hours: everyDay('19:00', '03:00'),
      categories: ['bar'],
    });
    const pool = [shishaBar, plainBar];

    expect(rankPlaces(pool, { now: NOW, tags: ['bar'] })).toHaveLength(2);
    expect(rankPlaces(pool, { now: NOW, tags: ['bar', 'shisha_lounge'] })).toHaveLength(1);
    expect(rankPlaces(pool, { now: NOW, tags: ['bar', 'rooftop'] })).toHaveLength(0);
  });

  it('filters by area', () => {
    const bandra = place({ slug: 'b', name: 'B', area_id: 8, hours: everyDay('19:00', '03:00') });
    const colaba = place({ slug: 'c', name: 'C', area_id: 13, hours: everyDay('19:00', '03:00') });
    expect(rankPlaces([bandra, colaba], { now: NOW, areaId: 8 })).toHaveLength(1);
  });
});

describe('countOpenNow', () => {
  it('counts only what is genuinely open', () => {
    expect(countOpenNow(ALL, NOW)).toBe(3);
    expect(countOpenNow(ALL, ist('2026-08-16T05:50'))).toBe(1); // only the 24-hour place
    expect(countOpenNow(ALL, ist('2026-08-15T12:00'))).toBe(2); // 24h + the 11:00–22:00 place
  });
});

describe('closingLatest', () => {
  it('lists open places with the most time left, excluding never-closing ones', () => {
    const strip = closingLatest(ALL, NOW);
    expect(strip.map((entry) => entry.place.slug)).toEqual(['till-four', 'till-two']);
  });

  it('respects the limit', () => {
    expect(closingLatest(ALL, NOW, 1)).toHaveLength(1);
  });
});
