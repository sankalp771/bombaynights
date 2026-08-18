import { haversineMetres } from '@/lib/geo';

/**
 * Deduping rule from docs/03: a manual row always wins over an OSM row for the
 * same place, where "same place" means a matching normalized name within 150 m.
 *
 * 150 m is deliberately tight. Mumbai has genuinely different outlets of the
 * same chain a few hundred metres apart (three Bademiya-adjacent counters in
 * Colaba alone), and merging those would be worse than keeping a duplicate the
 * owner can archive in one tap.
 */

export const DEDUPE_RADIUS_METRES = 150;

/** Chain suffixes and honorifics that carry no distinguishing information. */
const NOISE_WORDS = new Set([
  'restaurant',
  'restaurants',
  'hotel',
  'cafe',
  'café',
  'bar',
  'grill',
  'kitchen',
  'the',
  'and',
  'co',
  'company',
  'pvt',
  'ltd',
  'mumbai',
  'bombay',
]);

/**
 * A comparison key for names. "Bademiya Restaurant" and "bademiya" collapse to
 * the same key; "Bademiya Seekh Kebab" does not, because that really is a
 * different outlet.
 */
export function normalizeName(name: string): string {
  const words = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0 && !NOISE_WORDS.has(word));

  // If stripping noise words leaves nothing ("The Bar"), keep the original.
  if (words.length === 0) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  }
  return words.join(' ');
}

export interface Locatable {
  name: string;
  // Nullable since migration 0003: community places may carry no pin. A
  // pinless row can never distance-match, so it is skipped — the owner
  // archives any resulting duplicate in one tap, which beats a wrong merge.
  lat: number | null;
  lng: number | null;
}

/**
 * Find the existing row that represents the same physical place, if any.
 * Returns the closest match so a candidate between two same-named outlets
 * attaches to the nearer one.
 */
export function findDuplicate<T extends Locatable>(
  candidate: Locatable,
  existing: readonly T[],
  radiusMetres: number = DEDUPE_RADIUS_METRES,
): T | undefined {
  if (candidate.lat == null || candidate.lng == null) return undefined;
  const key = normalizeName(candidate.name);
  let best: T | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const row of existing) {
    if (row.lat == null || row.lng == null) continue;
    if (normalizeName(row.name) !== key) continue;
    const distance = haversineMetres(
      { lat: candidate.lat, lng: candidate.lng },
      { lat: row.lat, lng: row.lng },
    );
    if (distance <= radiusMetres && distance < bestDistance) {
      best = row;
      bestDistance = distance;
    }
  }

  return best;
}
