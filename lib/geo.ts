/**
 * Distance helpers. Deliberately plain maths, no PostGIS — at a few thousand
 * rows the whole approved dataset is fetched once and sorted in memory, which
 * is far cheaper than a spatial index we would have to maintain. See
 * DECISIONS.md for the upgrade path if the dataset grows 10×.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_008.8;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in metres. */
export function haversineMetres(a: LatLng, b: LatLng): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = lat2 - lat1;
  const dLng = toRadians(b.lng - a.lng);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * "450 m" / "1.2 km" / "14 km". Under a kilometre we round to 50 m because
 * false precision at 1 AM helps nobody.
 */
export function formatDistance(metres: number): string {
  if (!Number.isFinite(metres) || metres < 0) return '';
  if (metres < 1000) {
    const rounded = Math.max(50, Math.round(metres / 50) * 50);
    return `${rounded} m`;
  }
  const km = metres / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export function boundingBoxContains(box: BoundingBox, point: LatLng): boolean {
  return (
    point.lat >= box.south && point.lat < box.north && point.lng >= box.west && point.lng < box.east
  );
}

/** Overpass wants `south,west,north,east`. */
export function toOverpassBbox(box: BoundingBox): string {
  return `${box.south},${box.west},${box.north},${box.east}`;
}
