import { describe, expect, it } from 'vitest';
import { diffSubmission, summariseHours } from './submissionDiff';
import type { Place, SubmissionPayload } from './types';

const basePlace: Place = {
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'bademiya-fort-colaba',
  name: 'Bademiya',
  area_id: 13,
  address: 'Tulloch Road, Colaba',
  lat: 18.9219,
  lng: 72.8324,
  categories: ['street_food', 'rolls_kebabs'],
  food_type: 'nonveg',
  serves_alcohol: false,
  last_call: null,
  has_shisha: false,
  service_modes: ['takeaway'],
  hours: { mon: [{ open: '19:00', close: '02:30' }] },
  hours_verified: true,
  price_band: 2,
  phone: '+912222840038',
  notes: null,
  photo_url: null,
  status: 'approved',
  source: 'manual',
  osm_id: null,
  verified_at: '2026-08-01T00:00:00.000Z',
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
};

function payload(overrides: Partial<SubmissionPayload> = {}): SubmissionPayload {
  return {
    name: '',
    area_slug: null,
    lat: null,
    lng: null,
    address: null,
    categories: [],
    food_type: 'unknown',
    serves_alcohol: null,
    has_shisha: null,
    service_modes: [],
    hours: null,
    phone: null,
    notes: null,
    submitter_name: null,
    submitter_contact: null,
    photo_url: null,
    source_hint: null,
    corrected_slug: null,
    ...overrides,
  };
}

describe('diffSubmission', () => {
  it('reports nothing when the contributor filled nothing in', () => {
    expect(diffSubmission(basePlace, payload())).toEqual([]);
  });

  it('treats a blank field as no opinion, not as a deletion', () => {
    // The phone number is stored; the submission omits it. That must not read
    // as "remove the phone number".
    const diffs = diffSubmission(basePlace, payload({ notes: 'Cash only after 1 AM' }));
    expect(diffs.map((d) => d.field)).toEqual(['notes']);
  });

  it('shows before and after for a changed text field', () => {
    const diffs = diffSubmission(basePlace, payload({ address: 'Tulloch Rd, behind Taj' }));
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({
      field: 'address',
      before: 'Tulloch Road, Colaba',
      after: 'Tulloch Rd, behind Taj',
    });
  });

  it('ignores a field that was submitted identical to what is stored', () => {
    expect(diffSubmission(basePlace, payload({ name: 'Bademiya' }))).toEqual([]);
  });

  it('ignores food_type when the contributor left it unknown', () => {
    expect(diffSubmission(basePlace, payload({ food_type: 'unknown' }))).toEqual([]);
    expect(diffSubmission(basePlace, payload({ food_type: 'both' }))).toHaveLength(1);
  });

  it('distinguishes "no" from "not known" on the tristate fields', () => {
    expect(diffSubmission(basePlace, payload({ serves_alcohol: null }))).toEqual([]);

    const diffs = diffSubmission(basePlace, payload({ serves_alcohol: true }));
    expect(diffs[0]).toMatchObject({ field: 'serves_alcohol', before: 'no', after: 'yes' });
  });

  it('reports changed hours', () => {
    const diffs = diffSubmission(
      basePlace,
      payload({ hours: { mon: [{ open: '19:00', close: '04:00' }] } }),
    );
    expect(diffs.map((d) => d.field)).toEqual(['hours']);
    expect(diffs[0]?.after).toContain('4 AM');
  });

  it('ignores GPS jitter but reports a genuine move', () => {
    // ~5 m of phone-GPS noise is not a correction.
    expect(diffSubmission(basePlace, payload({ lat: 18.92194, lng: 72.83244 }))).toEqual([]);

    // ~200 m is.
    const moved = diffSubmission(basePlace, payload({ lat: 18.9239, lng: 72.8344 }));
    expect(moved.map((d) => d.field)).toEqual(['lat']);
  });

  it('reports a changed tag list', () => {
    const diffs = diffSubmission(basePlace, payload({ categories: ['street_food', 'late_night'] }));
    expect(diffs[0]).toMatchObject({
      field: 'categories',
      before: 'street_food, rolls_kebabs',
      after: 'street_food, late_night',
    });
  });
});

describe('summariseHours', () => {
  it('says so plainly when hours are unknown', () => {
    expect(summariseHours(null)).toBe('Not known');
  });

  it('renders each day, including the closed ones', () => {
    const text = summariseHours({ mon: [{ open: '19:00', close: '02:30' }] });
    expect(text).toContain('mon 7 PM–2:30 AM');
    expect(text).toContain('tue closed');
  });
});
