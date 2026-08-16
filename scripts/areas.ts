import { boundingBoxContains, haversineMetres, type BoundingBox, type LatLng } from '@/lib/geo';

/**
 * The Mira Road → Colaba corridor, north to south. This file is the single
 * source of truth for BOTH the `areas` table and the Overpass seed queries
 * (docs/03) — change an area here and both follow.
 *
 * The latitude bands are deliberately contiguous: each area's `north` is the
 * next one's `south`, so no place in the corridor can fall through a gap. The
 * longitude range is generous on the western side; that is open sea, so the
 * extra area costs nothing and guarantees we do not clip the coastline where
 * half the late-night spots actually are.
 */

export interface AreaDefinition {
  slug: string;
  name: string;
  /** North → south. Lower sorts first. */
  sortOrder: number;
  center: LatLng;
  bbox: BoundingBox;
  /**
   * Exceptions where a pure latitude band gets Mumbai's geography wrong —
   * Worli sits at the same latitude as Dadar but on the other side of the
   * island. Checked before the bands, so they win.
   */
  extraBoxes?: BoundingBox[];
  /** One line, used on /area/[slug] for SEO and to set the tone. */
  intro: string;
}

export const AREAS: readonly AreaDefinition[] = [
  {
    slug: 'mira-road-bhayandar',
    name: 'Mira Road–Bhayandar',
    sortOrder: 1,
    center: { lat: 19.2952, lng: 72.8544 },
    bbox: { south: 19.255, west: 72.79, north: 19.345, east: 72.905 },
    intro:
      'The far north of the corridor. Highway dhabas, late kebab counters and 24-hour tea near the station keep Mira Road and Bhayandar fed long after the last train.',
  },
  {
    slug: 'dahisar-borivali',
    name: 'Dahisar–Borivali',
    sortOrder: 2,
    center: { lat: 19.2403, lng: 72.8567 },
    bbox: { south: 19.215, west: 72.79, north: 19.255, east: 72.905 },
    intro:
      'Borivali and Dahisar run on station-side street food and a handful of bars that push past midnight on weekends.',
  },
  {
    slug: 'kandivali-malad',
    name: 'Kandivali–Malad',
    sortOrder: 3,
    center: { lat: 19.1975, lng: 72.8512 },
    bbox: { south: 19.17, west: 72.79, north: 19.215, east: 72.905 },
    intro:
      'Malad’s Link Road strip and the Kandivali galli joints — this is where the western suburbs go for a 1 AM plate of something fried.',
  },
  {
    slug: 'goregaon',
    name: 'Goregaon',
    sortOrder: 4,
    center: { lat: 19.1663, lng: 72.8526 },
    bbox: { south: 19.145, west: 72.79, north: 19.17, east: 72.905 },
    intro:
      'Film City’s neighbourhood keeps odd hours to match. Late shoots mean late kitchens around Goregaon East and West.',
  },
  {
    slug: 'jogeshwari-andheri',
    name: 'Jogeshwari–Andheri',
    sortOrder: 5,
    center: { lat: 19.1279, lng: 72.849 },
    bbox: { south: 19.11, west: 72.79, north: 19.145, east: 72.905 },
    intro:
      'Andheri is the busiest late-night belt in the suburbs — Lokhandwala, Versova and the airport side stay lit well past 2 AM.',
  },
  {
    slug: 'vile-parle-juhu',
    name: 'Vile Parle–Juhu',
    sortOrder: 6,
    center: { lat: 19.1024, lng: 72.836 },
    bbox: { south: 19.088, west: 72.79, north: 19.11, east: 72.9 },
    intro:
      'Juhu beach chaat, hotel coffee shops that never shut, and the Vile Parle side for a quieter, cheaper late plate.',
  },
  {
    slug: 'santacruz-khar',
    name: 'Santacruz–Khar',
    sortOrder: 7,
    center: { lat: 19.0755, lng: 72.838 },
    bbox: { south: 19.065, west: 72.79, north: 19.088, east: 72.9 },
    intro:
      'Khar’s linking-road bars and Santacruz’s late kitchens — the overflow from Bandra when Bandra is full.',
  },
  {
    slug: 'bandra',
    name: 'Bandra',
    sortOrder: 8,
    center: { lat: 19.0596, lng: 72.8295 },
    bbox: { south: 19.045, west: 72.79, north: 19.065, east: 72.9 },
    intro:
      'The default answer to “where tonight?” — Pali, Hill Road, Carter Road and the Bandra bar circuit, plus the rolls counters that outlast all of them.',
  },
  {
    slug: 'mahim-dadar',
    name: 'Mahim–Dadar',
    sortOrder: 9,
    center: { lat: 19.026, lng: 72.842 },
    bbox: { south: 19.008, west: 72.79, north: 19.045, east: 72.89 },
    intro:
      'Mahim’s all-night seekh and Dadar’s Irani-adjacent corners — old-Bombay eating, still going at 2 AM.',
  },
  {
    slug: 'lower-parel-worli',
    name: 'Lower Parel–Worli',
    sortOrder: 10,
    center: { lat: 18.998, lng: 72.823 },
    bbox: { south: 18.985, west: 72.79, north: 19.008, east: 72.87 },
    // Worli and Prabhadevi share a latitude with Dadar but sit on the western
    // shore. Without this they would be filed under Mahim–Dadar, which no one
    // in Bombay would accept.
    extraBoxes: [{ south: 19.008, west: 72.79, north: 19.032, east: 72.832 }],
    intro:
      'Mill-land nightlife. The Lower Parel and Worli lounges run late, and the sea-link side has the city’s best 2 AM view.',
  },
  {
    slug: 'byculla-mumbai-central',
    name: 'Byculla–Mumbai Central',
    sortOrder: 11,
    center: { lat: 18.9725, lng: 72.8275 },
    bbox: { south: 18.96, west: 72.79, north: 18.985, east: 72.86 },
    intro:
      'Bhendi Bazaar and Nagpada spill this way. Mughlai, kebabs and sweets that are busiest between midnight and dawn — especially in Ramzan.',
  },
  {
    slug: 'girgaon-marine-lines',
    name: 'Girgaon–Marine Lines',
    sortOrder: 12,
    center: { lat: 18.949, lng: 72.82 },
    bbox: { south: 18.938, west: 72.79, north: 18.96, east: 72.845 },
    intro:
      'Chowpatty and the Queen’s Necklace. Sandwich and juice stalls along Marine Drive stay up as long as the crowd does.',
  },
  {
    slug: 'fort-colaba',
    name: 'Fort–Colaba',
    sortOrder: 13,
    center: { lat: 18.92, lng: 72.828 },
    bbox: { south: 18.88, west: 72.79, north: 18.938, east: 72.85 },
    intro:
      'South Bombay’s late shift — Bademiya, Ayub’s, the Colaba causeway bars and the Fort corners that only make sense after midnight.',
  },
] as const;

export type AreaSlug = (typeof AREAS)[number]['slug'];

const BY_SLUG = new Map(AREAS.map((area) => [area.slug, area]));

export function areaBySlug(slug: string): AreaDefinition | undefined {
  return BY_SLUG.get(slug);
}

/**
 * Which area does this point belong to? Bounding boxes first (they tile the
 * corridor with no gaps), then nearest centre as a fallback so a place just
 * outside the corridor still lands somewhere sensible rather than nowhere.
 */
export function areaForPoint(point: LatLng): AreaDefinition | undefined {
  const exception = AREAS.find((area) =>
    area.extraBoxes?.some((box) => boundingBoxContains(box, point)),
  );
  if (exception) return exception;

  const inside = AREAS.find((area) => boundingBoxContains(area.bbox, point));
  if (inside) return inside;

  let best: AreaDefinition | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const area of AREAS) {
    const distance = haversineMetres(area.center, point);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = area;
    }
  }

  // Beyond ~12 km from every centre we are outside the corridor entirely.
  return bestDistance <= 12_000 ? best : undefined;
}
