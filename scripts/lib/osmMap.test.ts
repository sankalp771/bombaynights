import { describe, expect, it } from 'vitest';
import { mapOverpassElement } from './osmMap';

const BANDRA = { lat: 19.0596, lon: 72.8295 };

function element(tags: Record<string, string>, overrides: Record<string, unknown> = {}) {
  return { type: 'node', id: 1, ...BANDRA, tags, ...overrides };
}

describe('mapOverpassElement — the classification rules from docs/03', () => {
  it('includes a place whose hours run past midnight', () => {
    const result = mapOverpassElement(
      element({
        name: 'Late Bandra Kitchen',
        amenity: 'restaurant',
        opening_hours: 'Mo-Su 19:00-02:30',
      }),
    );
    expect(result.kind).toBe('mapped');
    if (result.kind !== 'mapped') return;
    expect(result.place.categories).toContain('restaurant');
    expect(result.place.categories).toContain('late_night');
    expect(result.place.area?.slug).toBe('bandra');
    expect(result.place.slug).toBe('late-bandra-kitchen-bandra');
    expect(result.place.osm_id).toBe('node/1');
  });

  it('SKIPS a place that shuts before midnight — this keeps the DB honest', () => {
    const result = mapOverpassElement(
      element({ name: 'Lunch Only', amenity: 'restaurant', opening_hours: 'Mo-Su 11:00-22:00' }),
    );
    expect(result).toMatchObject({ kind: 'skipped', reason: 'closes-before-midnight' });
  });

  it('includes a bar with no hours at all — bars skew late, the owner verifies', () => {
    const result = mapOverpassElement(element({ name: 'Unknown Hours Bar', amenity: 'bar' }));
    expect(result.kind).toBe('mapped');
    if (result.kind !== 'mapped') return;
    expect(result.place.hours).toBeNull();
    expect(result.place.serves_alcohol).toBe(true);
    // Never claim it is late-night without evidence.
    expect(result.place.categories).not.toContain('late_night');
  });

  it('skips a cafe with no hours — cafes do not skew late', () => {
    const result = mapOverpassElement(element({ name: 'Day Cafe', amenity: 'cafe' }));
    expect(result).toMatchObject({ kind: 'skipped', reason: 'no-hours-and-not-a-night-venue' });
  });

  it('tags a 24-hour place with 24x7', () => {
    const result = mapOverpassElement(
      element({ name: 'Always On', amenity: 'restaurant', opening_hours: '24/7' }),
    );
    expect(result.kind).toBe('mapped');
    if (result.kind !== 'mapped') return;
    expect(result.place.categories).toEqual(expect.arrayContaining(['24x7', 'late_night']));
  });
});

describe('mapOverpassElement — tag mapping', () => {
  it('maps cuisine to the fixed vocabulary and drops the rest', () => {
    const result = mapOverpassElement(
      element({
        name: 'Mixed Grill',
        amenity: 'restaurant',
        cuisine: 'biryani;kebab;interstellar_fusion',
        opening_hours: 'Mo-Su 19:00-03:00',
      }),
    );
    if (result.kind !== 'mapped') throw new Error('expected mapped');
    expect(result.place.categories).toEqual(expect.arrayContaining(['biryani', 'rolls_kebabs']));
    expect(result.place.categories).not.toContain('interstellar_fusion');
  });

  it('reads diet tags into food_type', () => {
    const veg = mapOverpassElement(
      element({
        name: 'Pure Veg',
        amenity: 'restaurant',
        'diet:vegetarian': 'only',
        opening_hours: 'Mo-Su 18:00-01:00',
      }),
    );
    if (veg.kind !== 'mapped') throw new Error('expected mapped');
    expect(veg.place.food_type).toBe('veg');

    const unknown = mapOverpassElement(element({ name: 'No Diet Tags', amenity: 'bar' }));
    if (unknown.kind !== 'mapped') throw new Error('expected mapped');
    expect(unknown.place.food_type).toBe('unknown');
  });

  it('leaves serves_alcohol null when nothing says either way', () => {
    const result = mapOverpassElement(
      element({
        name: 'Silent On Booze',
        amenity: 'restaurant',
        opening_hours: 'Mo-Su 19:00-02:00',
      }),
    );
    if (result.kind !== 'mapped') throw new Error('expected mapped');
    expect(result.place.serves_alcohol).toBeNull();
  });

  it('honours an explicit alcohol=no over the amenity default', () => {
    const result = mapOverpassElement(
      element({
        name: 'Dry Pub',
        amenity: 'pub',
        alcohol: 'no',
        opening_hours: 'Mo-Su 19:00-02:00',
      }),
    );
    if (result.kind !== 'mapped') throw new Error('expected mapped');
    expect(result.place.serves_alcohol).toBe(false);
  });

  it('detects shisha from several tagging styles', () => {
    const variants: Array<Record<string, string>> = [
      { amenity: 'hookah_lounge' },
      { amenity: 'restaurant', 'smoking:shisha': 'yes' },
      { amenity: 'restaurant', cuisine: 'shisha' },
    ];
    for (const tags of variants) {
      const result = mapOverpassElement(
        element({ name: 'Smoke Room', opening_hours: 'Mo-Su 19:00-02:00', ...tags }),
      );
      if (result.kind !== 'mapped') throw new Error('expected mapped');
      expect(result.place.has_shisha).toBe(true);
      expect(result.place.categories).toContain('shisha_lounge');
    }
  });

  it('builds an address and picks one phone number', () => {
    const result = mapOverpassElement(
      element({
        name: 'Addressed',
        amenity: 'restaurant',
        opening_hours: 'Mo-Su 19:00-02:00',
        'addr:housenumber': '12',
        'addr:street': 'Hill Road',
        'addr:suburb': 'Bandra West',
        'addr:city': 'Mumbai',
        phone: '+91 22 2640 1234;+91 98200 00000',
      }),
    );
    if (result.kind !== 'mapped') throw new Error('expected mapped');
    expect(result.place.address).toBe('12 Hill Road, Bandra West, Mumbai');
    expect(result.place.phone).toBe('+91 22 2640 1234');
  });

  it('marks fast food as takeaway and dine-in', () => {
    const result = mapOverpassElement(
      element({ name: 'Roll Counter', amenity: 'fast_food', opening_hours: 'Mo-Su 19:00-03:00' }),
    );
    if (result.kind !== 'mapped') throw new Error('expected mapped');
    expect(result.place.service_modes).toEqual(expect.arrayContaining(['dine_in', 'takeaway']));
  });
});

describe('mapOverpassElement — rejection', () => {
  it('drops nameless entries', () => {
    expect(mapOverpassElement(element({ amenity: 'bar' }))).toMatchObject({
      kind: 'skipped',
      reason: 'no-name',
    });
  });

  it('drops entries with no coordinates', () => {
    const result = mapOverpassElement({
      type: 'way',
      id: 9,
      tags: { name: 'Ghost', amenity: 'bar' },
    });
    expect(result).toMatchObject({ kind: 'skipped', reason: 'no-coordinates' });
  });

  it('uses way centres when present', () => {
    const result = mapOverpassElement({
      type: 'way',
      id: 9,
      center: { lat: 18.9226, lon: 72.8322 },
      tags: { name: 'Bademiya-ish', amenity: 'fast_food', opening_hours: 'Mo-Su 19:00-04:00' },
    });
    if (result.kind !== 'mapped') throw new Error('expected mapped');
    expect(result.place.area?.slug).toBe('fort-colaba');
    expect(result.place.osm_id).toBe('way/9');
  });

  it('drops places outside the corridor', () => {
    const result = mapOverpassElement(
      element({ name: 'Thane Bar', amenity: 'bar' }, { lat: 19.2183, lon: 72.9781 }),
    );
    expect(result).toMatchObject({ kind: 'skipped', reason: 'outside-corridor' });
  });

  it('drops structurally invalid elements instead of throwing', () => {
    expect(mapOverpassElement({ nonsense: true })).toMatchObject({
      kind: 'skipped',
      reason: 'invalid-element',
    });
    expect(mapOverpassElement(null)).toMatchObject({ kind: 'skipped', reason: 'invalid-element' });
  });
});
