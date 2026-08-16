import { z } from 'zod';
import { nullableWeeklyHoursSchema } from './hours';

/**
 * The shared vocabulary. Everything that crosses a boundary — Overpass
 * responses, CSV rows, form posts, query params — is validated against these,
 * per CLAUDE.md.
 */

export const PLACE_STATUSES = ['pending', 'approved', 'rejected', 'archived'] as const;
export const PLACE_SOURCES = ['osm', 'manual', 'community', 'scraped'] as const;
export const FOOD_TYPES = ['veg', 'nonveg', 'both', 'unknown'] as const;
export const SERVICE_MODES = ['dine_in', 'takeaway', 'car_dining', 'delivery_only'] as const;

export const placeStatusSchema = z.enum(PLACE_STATUSES);
export const placeSourceSchema = z.enum(PLACE_SOURCES);
export const foodTypeSchema = z.enum(FOOD_TYPES);
export const serviceModeSchema = z.enum(SERVICE_MODES);

export type PlaceStatus = z.infer<typeof placeStatusSchema>;
export type PlaceSource = z.infer<typeof placeSourceSchema>;
export type FoodType = z.infer<typeof foodTypeSchema>;
export type ServiceMode = z.infer<typeof serviceModeSchema>;

/**
 * The fixed category vocabulary (docs/03). Anything outside this list is
 * dropped rather than stored — an open-ended tag set becomes unfilterable
 * within a month.
 */
export const VENUE_CATEGORIES = [
  'bar',
  'pub',
  'nightclub',
  'restaurant',
  'cafe',
  'street_food',
  'fast_food',
  'dessert',
  'bakery',
  'dhaba',
  'shisha_lounge',
  'rooftop',
  '24x7',
  'late_night',
] as const;

export const CUISINE_CATEGORIES = [
  'chinese',
  'mughlai',
  'south_indian',
  'north_indian',
  'seafood',
  'rolls_kebabs',
  'pav_bhaji',
  'biryani',
  'pizza',
  'burgers',
  'chai_coffee',
  'juice_falooda',
] as const;

export const CATEGORIES = [...VENUE_CATEGORIES, ...CUISINE_CATEGORIES] as const;

export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

export const CATEGORY_LABELS: Record<Category, string> = {
  bar: 'Bar',
  pub: 'Pub',
  nightclub: 'Nightclub',
  restaurant: 'Restaurant',
  cafe: 'Café',
  street_food: 'Street food',
  fast_food: 'Fast food',
  dessert: 'Dessert',
  bakery: 'Bakery',
  dhaba: 'Dhaba',
  shisha_lounge: 'Shisha',
  rooftop: 'Rooftop',
  '24x7': '24×7',
  late_night: 'Late night',
  chinese: 'Chinese',
  mughlai: 'Mughlai',
  south_indian: 'South Indian',
  north_indian: 'North Indian',
  seafood: 'Seafood',
  rolls_kebabs: 'Rolls & kebabs',
  pav_bhaji: 'Pav bhaji',
  biryani: 'Biryani',
  pizza: 'Pizza',
  burgers: 'Burgers',
  chai_coffee: 'Chai & coffee',
  juice_falooda: 'Juice & falooda',
};

/** Tags worth surfacing as one-tap filters on the landing page. */
export const FEATURED_CATEGORIES: readonly Category[] = [
  'biryani',
  'shisha_lounge',
  'bar',
  'chai_coffee',
  'street_food',
  'rolls_kebabs',
  'dhaba',
  '24x7',
  'cafe',
  'pav_bhaji',
];

export const REPORT_REASONS = [
  'closed_when_listed_open',
  'wrong_hours',
  'shut_down',
  'osm_hours_drifted',
  'other',
] as const;

export const reportReasonSchema = z.enum(REPORT_REASONS);
export type ReportReason = z.infer<typeof reportReasonSchema>;

/** Reasons a visitor can pick. `osm_hours_drifted` is machine-filed only. */
export const VISITOR_REPORT_REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: 'closed_when_listed_open', label: 'It was shut when you said open' },
  { value: 'wrong_hours', label: 'Timings are wrong' },
  { value: 'shut_down', label: 'This place has shut down' },
  { value: 'other', label: 'Something else' },
];

export const areaSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  name: z.string(),
  sort_order: z.number().int(),
  center_lat: z.number(),
  center_lng: z.number(),
  intro: z.string().nullable(),
});

export type Area = z.infer<typeof areaSchema>;

/** A row of `places` exactly as it comes back from the database. */
export const placeSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  area_id: z.number().int().nullable(),
  address: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  categories: z.array(z.string()),
  food_type: foodTypeSchema,
  serves_alcohol: z.boolean().nullable(),
  last_call: z.string().nullable(),
  has_shisha: z.boolean().nullable(),
  service_modes: z.array(z.string()),
  hours: nullableWeeklyHoursSchema.catch(null),
  hours_verified: z.boolean(),
  price_band: z.number().int().min(1).max(4).nullable(),
  phone: z.string().nullable(),
  notes: z.string().nullable(),
  photo_url: z.string().nullable(),
  status: placeStatusSchema,
  source: placeSourceSchema,
  osm_id: z.string().nullable(),
  verified_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Place = z.infer<typeof placeSchema>;

/** What the public list actually needs. Keeps the cached payload small. */
export type PublicPlace = Pick<
  Place,
  | 'id'
  | 'slug'
  | 'name'
  | 'area_id'
  | 'address'
  | 'lat'
  | 'lng'
  | 'categories'
  | 'food_type'
  | 'serves_alcohol'
  | 'has_shisha'
  | 'service_modes'
  | 'hours'
  | 'hours_verified'
  | 'price_band'
  | 'phone'
  | 'notes'
  | 'last_call'
  | 'verified_at'
>;

export const PUBLIC_PLACE_COLUMNS = [
  'id',
  'slug',
  'name',
  'area_id',
  'address',
  'lat',
  'lng',
  'categories',
  'food_type',
  'serves_alcohol',
  'has_shisha',
  'service_modes',
  'hours',
  'hours_verified',
  'price_band',
  'phone',
  'notes',
  'last_call',
  'verified_at',
].join(',');

/** Keep only tags from the fixed vocabulary, deduped and in canonical order. */
export function normalizeCategories(input: readonly string[]): Category[] {
  const wanted = new Set(
    input.map((value) => value.trim().toLowerCase()).filter((value) => value.length > 0),
  );
  return CATEGORIES.filter((category) => wanted.has(category));
}

export function normalizeServiceModes(input: readonly string[]): ServiceMode[] {
  const wanted = new Set(input.map((value) => value.trim().toLowerCase()));
  return SERVICE_MODES.filter((mode) => wanted.has(mode));
}
