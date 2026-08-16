import { describe, expect, it } from 'vitest';
import { AREAS, areaBySlug, areaForPoint } from './areas';

describe('the corridor definition', () => {
  it('has the 13 areas listed in docs/03', () => {
    expect(AREAS).toHaveLength(13);
  });

  it('is ordered north → south with contiguous latitude bands and no gaps', () => {
    const ordered = [...AREAS].sort((a, b) => a.sortOrder - b.sortOrder);
    expect(ordered.map((a) => a.slug)).toEqual(AREAS.map((a) => a.slug));

    for (let i = 1; i < ordered.length; i += 1) {
      const north = ordered[i - 1]!;
      const south = ordered[i]!;
      // Each area starts exactly where the one above it ends.
      expect(south.bbox.north).toBeCloseTo(north.bbox.south, 6);
      // And it really is further south.
      expect(south.center.lat).toBeLessThan(north.center.lat);
    }
  });

  it('has unique slugs and sort orders', () => {
    expect(new Set(AREAS.map((a) => a.slug)).size).toBe(AREAS.length);
    expect(new Set(AREAS.map((a) => a.sortOrder)).size).toBe(AREAS.length);
  });

  it('keeps every centre inside its own bounding box', () => {
    for (const area of AREAS) {
      expect(area.center.lat, area.slug).toBeGreaterThanOrEqual(area.bbox.south);
      expect(area.center.lat, area.slug).toBeLessThan(area.bbox.north);
      expect(area.center.lng, area.slug).toBeGreaterThanOrEqual(area.bbox.west);
      expect(area.center.lng, area.slug).toBeLessThan(area.bbox.east);
    }
  });

  it('gives every area a non-empty intro for the SEO pages', () => {
    for (const area of AREAS) {
      expect(area.intro.length, area.slug).toBeGreaterThan(40);
    }
  });
});

describe('areaForPoint', () => {
  it('places well-known spots in the right area', () => {
    expect(areaForPoint({ lat: 18.9226, lng: 72.8322 })?.slug).toBe('fort-colaba'); // Bademiya
    expect(areaForPoint({ lat: 19.0596, lng: 72.8295 })?.slug).toBe('bandra');
    expect(areaForPoint({ lat: 19.1197, lng: 72.8468 })?.slug).toBe('jogeshwari-andheri');
    expect(areaForPoint({ lat: 19.2952, lng: 72.8544 })?.slug).toBe('mira-road-bhayandar');
    expect(areaForPoint({ lat: 18.9432, lng: 72.8232 })?.slug).toBe('girgaon-marine-lines');
  });

  it('files Worli under Lower Parel–Worli, not Mahim–Dadar', () => {
    // Worli and Dadar share a latitude; only the longitude tells them apart.
    expect(areaForPoint({ lat: 19.0176, lng: 72.818 })?.slug).toBe('lower-parel-worli');
    expect(areaForPoint({ lat: 19.0176, lng: 72.844 })?.slug).toBe('mahim-dadar');
  });

  it('falls back to the nearest area just outside the boxes', () => {
    // Slightly north of Mira Road, still plausibly in scope.
    expect(areaForPoint({ lat: 19.36, lng: 72.86 })?.slug).toBe('mira-road-bhayandar');
  });

  it('returns undefined for places clearly outside the corridor', () => {
    expect(areaForPoint({ lat: 19.2183, lng: 72.9781 })).toBeUndefined(); // Thane
    expect(areaForPoint({ lat: 28.6139, lng: 77.209 })).toBeUndefined(); // Delhi
  });
});

describe('areaBySlug', () => {
  it('finds areas and returns undefined for unknown slugs', () => {
    expect(areaBySlug('bandra')?.name).toBe('Bandra');
    expect(areaBySlug('juhu')).toBeUndefined();
  });
});
