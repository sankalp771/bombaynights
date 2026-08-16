import { describe, expect, it } from 'vitest';
import {
  boundingBoxContains,
  formatDistance,
  haversineMetres,
  toOverpassBbox,
  type LatLng,
} from './geo';

const bandraStation: LatLng = { lat: 19.0544, lng: 72.8402 };
const bademiya: LatLng = { lat: 18.9226, lng: 72.8322 };

describe('haversineMetres', () => {
  it('is zero for the same point', () => {
    expect(haversineMetres(bandraStation, bandraStation)).toBe(0);
  });

  it('matches the known Bandra → Colaba distance (~14.7 km) within 1%', () => {
    const metres = haversineMetres(bandraStation, bademiya);
    expect(metres).toBeGreaterThan(14_500);
    expect(metres).toBeLessThan(14_900);
  });

  it('is symmetric', () => {
    expect(haversineMetres(bandraStation, bademiya)).toBeCloseTo(
      haversineMetres(bademiya, bandraStation),
      6,
    );
  });

  it('handles short distances used by the 150 m dedupe rule', () => {
    // ~0.001° of latitude ≈ 111 m.
    const near = { lat: bandraStation.lat + 0.001, lng: bandraStation.lng };
    const metres = haversineMetres(bandraStation, near);
    expect(metres).toBeGreaterThan(105);
    expect(metres).toBeLessThan(118);
  });
});

describe('formatDistance', () => {
  it('rounds short distances to 50 m and keeps a sane floor', () => {
    expect(formatDistance(20)).toBe('50 m');
    expect(formatDistance(440)).toBe('450 m');
    expect(formatDistance(999)).toBe('1000 m');
  });

  it('switches to kilometres above 1 km', () => {
    expect(formatDistance(1200)).toBe('1.2 km');
    expect(formatDistance(9949)).toBe('9.9 km');
    expect(formatDistance(14_700)).toBe('15 km');
  });

  it('returns an empty string for nonsense rather than "NaN m"', () => {
    expect(formatDistance(Number.NaN)).toBe('');
    expect(formatDistance(-5)).toBe('');
  });
});

describe('bounding boxes', () => {
  const box = { south: 19.04, west: 72.8, north: 19.065, east: 72.86 };

  it('contains points inside, excludes the northern and eastern edges', () => {
    expect(boundingBoxContains(box, bandraStation)).toBe(true);
    expect(boundingBoxContains(box, { lat: 19.065, lng: 72.84 })).toBe(false);
    expect(boundingBoxContains(box, { lat: 19.05, lng: 72.86 })).toBe(false);
    expect(boundingBoxContains(box, { lat: 19.04, lng: 72.8 })).toBe(true);
  });

  it('serialises in Overpass order: south,west,north,east', () => {
    expect(toOverpassBbox(box)).toBe('19.04,72.8,19.065,72.86');
  });
});
