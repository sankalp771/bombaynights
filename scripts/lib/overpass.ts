import { toOverpassBbox, type BoundingBox } from '@/lib/geo';

/**
 * A polite Overpass client. Overpass is a free, shared, volunteer-funded
 * service — the rules in docs/03 are not optional:
 *   · one bulk query per area, never per place
 *   · at least 2 s between requests
 *   · an identifying User-Agent
 *   · fall back to a mirror, then give up gracefully
 */

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
] as const;

const USER_AGENT = 'BombayNights-seed/1.0 (https://github.com/sankalp771/bombaynights)';
const MIN_INTERVAL_MS = 2_500;

let lastRequestAt = 0;

async function throttle(): Promise<void> {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

/** The query from docs/03, one bbox at a time. */
export function buildQuery(bbox: BoundingBox): string {
  const box = toOverpassBbox(bbox);
  return `[out:json][timeout:60];
(
  nwr["amenity"~"^(restaurant|bar|cafe|fast_food|pub|nightclub|food_court|ice_cream)$"](${box});
  nwr["shop"~"^(bakery|convenience)$"]["opening_hours"](${box});
  nwr["amenity"="hookah_lounge"](${box});
);
out center tags;`;
}

export class OverpassUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OverpassUnavailableError';
  }
}

/**
 * Run one query, trying each endpoint in turn. Overpass answers 429/504 under
 * load often enough that a single failure means nothing; both endpoints failing
 * means the run is over, and the caller reports that rather than pretending the
 * data is empty.
 */
export async function runQuery(query: string, attemptsPerEndpoint = 2): Promise<unknown> {
  const failures: string[] = [];

  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= attemptsPerEndpoint; attempt += 1) {
      await throttle();
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': USER_AGENT,
            Accept: 'application/json',
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(90_000),
        });

        if (response.status === 429 || response.status === 504) {
          failures.push(`${endpoint} → ${response.status}`);
          // Overpass asks for a real pause when it is saturated.
          await new Promise((resolve) => setTimeout(resolve, 5_000 * attempt));
          continue;
        }
        if (!response.ok) {
          failures.push(`${endpoint} → HTTP ${response.status}`);
          break;
        }

        return await response.json();
      } catch (error) {
        failures.push(`${endpoint} → ${(error as Error).message}`);
      }
    }
  }

  throw new OverpassUnavailableError(
    `Overpass is unavailable (nothing user-facing depends on it). Tried:\n  ${failures.join('\n  ')}`,
  );
}
