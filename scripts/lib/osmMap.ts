import { z } from 'zod';
import { isAlwaysOpen, isLateNight } from '@/lib/openNow';
import { slugify } from '@/lib/format';
import {
  normalizeCategories,
  normalizeServiceModes,
  type Category,
  type FoodType,
  type ServiceMode,
} from '@/lib/types';
import type { WeeklyHours } from '@/lib/hours';
import { areaForPoint, type AreaDefinition } from '../areas';
import { parseOsmOpeningHours } from './osmHours';

/**
 * Overpass element → our schema (docs/03 § pipeline). Everything here is
 * conservative: a tag we cannot map confidently becomes nothing rather than a
 * guess, because a wrong tag is worse than a missing one when the whole point
 * is trustworthy data.
 */

export const overpassElementSchema = z.object({
  type: z.enum(['node', 'way', 'relation']),
  id: z.number(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string()).optional(),
});

export type OverpassElement = z.infer<typeof overpassElementSchema>;

export const overpassResponseSchema = z.object({
  elements: z.array(z.unknown()),
});

/** Amenities that skew late even when OSM has no hours for them. */
const NIGHT_AMENITIES = new Set(['bar', 'pub', 'nightclub', 'hookah_lounge']);

const AMENITY_CATEGORY: Record<string, Category> = {
  restaurant: 'restaurant',
  bar: 'bar',
  pub: 'pub',
  cafe: 'cafe',
  fast_food: 'fast_food',
  nightclub: 'nightclub',
  food_court: 'restaurant',
  ice_cream: 'dessert',
  hookah_lounge: 'shisha_lounge',
};

const SHOP_CATEGORY: Record<string, Category> = {
  bakery: 'bakery',
};

/**
 * OSM `cuisine` is free-form and semicolon-separated. Only values we can map to
 * the fixed vocabulary survive; everything else is dropped.
 */
const CUISINE_CATEGORY: Record<string, Category> = {
  chinese: 'chinese',
  asian: 'chinese',
  mughlai: 'mughlai',
  mughlai_food: 'mughlai',
  south_indian: 'south_indian',
  north_indian: 'north_indian',
  punjabi: 'north_indian',
  seafood: 'seafood',
  fish: 'seafood',
  kebab: 'rolls_kebabs',
  kabab: 'rolls_kebabs',
  rolls: 'rolls_kebabs',
  pav_bhaji: 'pav_bhaji',
  biryani: 'biryani',
  pizza: 'pizza',
  burger: 'burgers',
  coffee_shop: 'chai_coffee',
  coffee: 'chai_coffee',
  tea: 'chai_coffee',
  chai: 'chai_coffee',
  juice: 'juice_falooda',
  ice_cream: 'dessert',
  dessert: 'dessert',
  cake: 'bakery',
  bakery: 'bakery',
  street_food: 'street_food',
  dhaba: 'dhaba',
};

export interface MappedPlace {
  slug: string;
  name: string;
  osm_id: string;
  lat: number;
  lng: number;
  address: string | null;
  categories: Category[];
  food_type: FoodType;
  serves_alcohol: boolean | null;
  has_shisha: boolean | null;
  service_modes: ServiceMode[];
  hours: WeeklyHours | null;
  phone: string | null;
  area: AreaDefinition | undefined;
  /** Raw OSM string, kept only for the seed report — never stored. */
  rawOpeningHours: string | null;
}

export type MapOutcome =
  { kind: 'mapped'; place: MappedPlace } | { kind: 'skipped'; reason: SkipReason; name?: string };

export type SkipReason =
  | 'invalid-element'
  | 'no-name'
  | 'no-coordinates'
  | 'outside-corridor'
  | 'closes-before-midnight'
  | 'no-hours-and-not-a-night-venue';

export function mapOverpassElement(input: unknown): MapOutcome {
  const parsed = overpassElementSchema.safeParse(input);
  if (!parsed.success) return { kind: 'skipped', reason: 'invalid-element' };

  const element = parsed.data;
  const tags = element.tags ?? {};

  const name = (tags.name ?? tags['name:en'] ?? '').trim();
  if (!name) return { kind: 'skipped', reason: 'no-name' };

  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return { kind: 'skipped', reason: 'no-coordinates', name };
  }

  const area = areaForPoint({ lat, lng });
  if (!area) return { kind: 'skipped', reason: 'outside-corridor', name };

  const rawOpeningHours = tags.opening_hours?.trim() ?? null;
  const { hours } = parseOsmOpeningHours(rawOpeningHours);
  const amenity = tags.amenity ?? '';

  // docs/03 classification. A place whose stored hours say it shuts before
  // midnight is dropped outright — carrying it would dilute the one promise
  // this directory makes.
  if (hours) {
    if (!isLateNight(hours)) return { kind: 'skipped', reason: 'closes-before-midnight', name };
  } else if (!NIGHT_AMENITIES.has(amenity)) {
    return { kind: 'skipped', reason: 'no-hours-and-not-a-night-venue', name };
  }

  const categories = new Set<string>();
  const amenityCategory = AMENITY_CATEGORY[amenity];
  if (amenityCategory) categories.add(amenityCategory);
  const shopCategory = tags.shop ? SHOP_CATEGORY[tags.shop] : undefined;
  if (shopCategory) categories.add(shopCategory);
  for (const cuisine of splitMulti(tags.cuisine)) {
    const mapped = CUISINE_CATEGORY[cuisine];
    if (mapped) categories.add(mapped);
  }
  if (hours && isLateNight(hours)) categories.add('late_night');
  if (hours && isAlwaysOpen(hours)) categories.add('24x7');
  if (isShisha(tags)) categories.add('shisha_lounge');
  if (tags.outdoor_seating === 'rooftop' || tags.level === 'roof') categories.add('rooftop');

  return {
    kind: 'mapped',
    place: {
      slug: slugify(name, area.name),
      name,
      osm_id: `${element.type}/${element.id}`,
      lat,
      lng,
      address: buildAddress(tags),
      categories: normalizeCategories([...categories]),
      food_type: readFoodType(tags),
      serves_alcohol: readServesAlcohol(tags, amenity),
      has_shisha: isShisha(tags) ? true : null,
      service_modes: readServiceModes(tags, amenity),
      hours,
      phone: readPhone(tags),
      area,
      rawOpeningHours,
    },
  };
}

function splitMulti(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(';')
    .map((part) => part.trim().toLowerCase().replace(/\s+/g, '_'))
    .filter(Boolean);
}

function isShisha(tags: Record<string, string>): boolean {
  return (
    tags.amenity === 'hookah_lounge' ||
    tags['smoking:shisha'] === 'yes' ||
    tags.shisha === 'yes' ||
    splitMulti(tags.cuisine).includes('shisha')
  );
}

function readFoodType(tags: Record<string, string>): FoodType {
  const vegetarian = tags['diet:vegetarian'];
  const vegan = tags['diet:vegan'];
  const nonVeg = tags['diet:non-vegetarian'] ?? tags['diet:meat'];

  if (vegetarian === 'only' || vegan === 'only') return 'veg';
  if (nonVeg === 'only') return 'nonveg';
  if (vegetarian === 'yes' && nonVeg === 'yes') return 'both';
  if (vegetarian === 'yes') return 'both';
  if (nonVeg === 'yes') return 'nonveg';
  return 'unknown';
}

function readServesAlcohol(tags: Record<string, string>, amenity: string): boolean | null {
  const explicit = tags['drink:alcohol'] ?? tags.alcohol;
  if (explicit === 'no' || explicit === 'none') return false;
  if (explicit && explicit !== 'unknown') return true;
  if (amenity === 'bar' || amenity === 'pub' || amenity === 'nightclub') return true;
  return null;
}

function readServiceModes(tags: Record<string, string>, amenity: string): ServiceMode[] {
  const modes = new Set<string>();

  if (tags.delivery === 'only') {
    modes.add('delivery_only');
  } else {
    if (tags.takeaway === 'only') {
      modes.add('takeaway');
    } else {
      if (tags.takeaway === 'yes' || amenity === 'fast_food') modes.add('takeaway');
      if (tags.dine_in !== 'no') modes.add('dine_in');
    }
    if (tags.drive_through === 'yes') modes.add('car_dining');
  }

  return normalizeServiceModes([...modes]);
}

function readPhone(tags: Record<string, string>): string | null {
  const raw = tags.phone ?? tags['contact:phone'] ?? tags['contact:mobile'] ?? tags.mobile;
  if (!raw) return null;
  // Multiple numbers are common; keep the first and tidy the spacing.
  const first = raw.split(';')[0]?.trim();
  return first ? first.replace(/\s+/g, ' ') : null;
}

function buildAddress(tags: Record<string, string>): string | null {
  const parts = [
    [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
    tags['addr:suburb'],
    tags['addr:city'],
    tags['addr:postcode'],
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  const address = [...new Set(parts)].join(', ');
  return address || null;
}
