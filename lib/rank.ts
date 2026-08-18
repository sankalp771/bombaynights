import { getOpenState, type OpenState } from './openNow';
import { haversineMetres, type LatLng } from './geo';
import type { PublicPlace } from './types';

/**
 * Filtering and ordering for the list. Pure so it can be unit-tested at a fixed
 * instant, and cheap enough to re-run in the browser every minute — which is
 * how a five-minute-cached page still shows the truth at 01:59 and 02:01.
 */

export interface RankedPlace {
  place: PublicPlace;
  state: OpenState;
  /** Metres from the visitor, or null when we do not know where they are. */
  distanceMetres: number | null;
}

export interface RankOptions {
  now: Date;
  origin?: LatLng | null;
  /** Only places open at `now`. This is the default scope on /places. */
  openOnly?: boolean;
  areaId?: number | null;
  /** Tags are AND-combined: every one must be present. */
  tags?: readonly string[];
}

/** How "open" a state is, for the primary sort. Higher wins. */
function opennessRank(state: OpenState): number {
  switch (state.kind) {
    case 'always_open':
      return 3;
    case 'open':
      return 2;
    case 'unknown':
      // Hours unverified — behind everything we can vouch for, but ahead of a
      // place we know is shut.
      return 1;
    case 'closed':
      return 0;
  }
}

/**
 * Minutes of remaining open time, for the "closing latest" tiebreak. A place
 * that never closes wins; a shut place has none.
 */
function remainingMinutes(state: OpenState): number {
  if (state.kind === 'always_open') return Number.POSITIVE_INFINITY;
  if (state.kind === 'open') return state.minutesLeft;
  return -1;
}

export function rankPlaces(places: readonly PublicPlace[], options: RankOptions): RankedPlace[] {
  const { now, origin, openOnly = false, areaId = null, tags = [] } = options;

  const ranked: RankedPlace[] = [];

  for (const place of places) {
    if (areaId !== null && place.area_id !== areaId) continue;
    if (tags.length > 0 && !tags.every((tag) => place.categories.includes(tag))) continue;

    const state = getOpenState(place.hours, now);
    if (openOnly && state.kind !== 'open' && state.kind !== 'always_open') continue;

    ranked.push({
      place,
      state,
      distanceMetres:
        origin && place.lat != null && place.lng != null
          ? haversineMetres(origin, { lat: place.lat, lng: place.lng })
          : null,
    });
  }

  // open now → closing latest → nearest → name. The order is the product: at
  // 1 AM you want somewhere open, that will still be open when you arrive, and
  // that is close.
  ranked.sort((a, b) => {
    const openness = opennessRank(b.state) - opennessRank(a.state);
    if (openness !== 0) return openness;

    const remaining = remainingMinutes(b.state) - remainingMinutes(a.state);
    if (remaining !== 0 && Number.isFinite(remaining)) return remaining;
    if (remaining !== 0) return remaining > 0 ? 1 : -1;

    if (a.distanceMetres !== null && b.distanceMetres !== null) {
      const distance = a.distanceMetres - b.distanceMetres;
      if (distance !== 0) return distance;
    }

    return a.place.name.localeCompare(b.place.name);
  });

  return ranked;
}

/** How many places are open right now, for the landing-page headline. */
export function countOpenNow(places: readonly PublicPlace[], now: Date): number {
  let count = 0;
  for (const place of places) {
    const kind = getOpenState(place.hours, now).kind;
    if (kind === 'open' || kind === 'always_open') count += 1;
  }
  return count;
}

/** The "closing latest tonight" strip: open places with the most time left. */
export function closingLatest(places: readonly PublicPlace[], now: Date, limit = 6): RankedPlace[] {
  return rankPlaces(places, { now, openOnly: true })
    .filter((entry) => entry.state.kind === 'open')
    .slice(0, limit);
}
