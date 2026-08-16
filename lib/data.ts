import 'server-only';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from './supabase';
import {
  areaSchema,
  placeSchema,
  PUBLIC_PLACE_COLUMNS,
  type Area,
  type PublicPlace,
} from './types';

/**
 * The read path for the public site.
 *
 * The whole approved dataset is fetched once and cached for five minutes
 * (docs/02). "Open now" is deliberately NOT part of that cache — it is computed
 * in the browser on every render, so a cached page stays correct as the clock
 * ticks past a closing time. Cache the facts, compute the judgement.
 *
 * A direct-Postgres driver exists purely for local development, behind
 * `BN_DB_DRIVER=postgres`. In production this file only ever talks to Supabase
 * with the anon key, through RLS.
 */

const REVALIDATE_SECONDS = 300;

const shouldUseDirectPostgres = () =>
  process.env.BN_DB_DRIVER === 'postgres' && Boolean(process.env.SUPABASE_DB_URL);

async function queryPostgres<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  // Dynamic so `pg` is never pulled into a Supabase-only deployment.
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  try {
    const { rows } = await client.query(sql, params);
    return rows as T[];
  } finally {
    await client.end();
  }
}

async function fetchAreas(): Promise<Area[]> {
  if (shouldUseDirectPostgres()) {
    const rows = await queryPostgres<Area>('select * from areas order by sort_order');
    return rows.map((row) => areaSchema.parse(row));
  }

  const { data, error } = await createPublicClient().from('areas').select('*').order('sort_order');
  if (error) throw new Error(`Could not load areas: ${error.message}`);
  return (data ?? []).map((row) => areaSchema.parse(row));
}

const publicPlaceSchema = placeSchema.pick({
  id: true,
  slug: true,
  name: true,
  area_id: true,
  address: true,
  lat: true,
  lng: true,
  categories: true,
  food_type: true,
  serves_alcohol: true,
  has_shisha: true,
  service_modes: true,
  hours: true,
  hours_verified: true,
  price_band: true,
  phone: true,
  notes: true,
  last_call: true,
  verified_at: true,
});

async function fetchApprovedPlaces(): Promise<PublicPlace[]> {
  if (shouldUseDirectPostgres()) {
    const rows = await queryPostgres<Record<string, unknown>>(
      `select ${PUBLIC_PLACE_COLUMNS} from places where status = 'approved' order by name`,
    );
    return rows.map((row) => publicPlaceSchema.parse(row));
  }

  const client = createPublicClient();
  const pageSize = 1000;
  const all: PublicPlace[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from('places')
      .select(PUBLIC_PLACE_COLUMNS)
      // Belt to the RLS suspenders: the policy already restricts this, but
      // saying it here means a policy regression shows up as missing data
      // rather than as leaked pending rows.
      .eq('status', 'approved')
      .order('name')
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Could not load places: ${error.message}`);
    const page = (data ?? []).map((row) => publicPlaceSchema.parse(row));
    all.push(...page);
    if (page.length < pageSize) break;
  }

  return all;
}

export const getAreas = unstable_cache(fetchAreas, ['areas'], {
  revalidate: REVALIDATE_SECONDS,
  tags: ['areas'],
});

export const getApprovedPlaces = unstable_cache(fetchApprovedPlaces, ['approved-places'], {
  revalidate: REVALIDATE_SECONDS,
  tags: ['places'],
});

export async function getPlaceBySlug(slug: string): Promise<PublicPlace | undefined> {
  const places = await getApprovedPlaces();
  return places.find((place) => place.slug === slug);
}

/** Areas that actually have at least one approved place, in north→south order. */
export async function getAreasWithCounts(): Promise<Array<Area & { count: number }>> {
  const [areas, places] = await Promise.all([getAreas(), getApprovedPlaces()]);
  const counts = new Map<number, number>();
  for (const place of places) {
    if (place.area_id === null) continue;
    counts.set(place.area_id, (counts.get(place.area_id) ?? 0) + 1);
  }
  return areas.map((area) => ({ ...area, count: counts.get(area.id) ?? 0 }));
}
