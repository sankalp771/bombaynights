import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Area, Place } from '@/lib/types';
import { flagValue, optionalEnv } from './env';

/**
 * Scripts talk to the database through this narrow interface so the same seeder
 * runs two ways:
 *
 *   · **Supabase** (default) — service-role key over HTTPS. This is what the
 *     GitHub Action uses, and it needs no Postgres port open.
 *   · **Direct Postgres** (`--url=…` or `SUPABASE_DB_URL`) — for local
 *     development against a throwaway cluster, and for anyone whose network
 *     blocks the Supabase API.
 *
 * Keeping it this narrow is deliberate: every method below is a real operation
 * the seeders need, and nothing else can be reached from a script.
 */

export interface AreaUpsert {
  slug: string;
  name: string;
  sort_order: number;
  center_lat: number;
  center_lng: number;
  intro: string | null;
}

export type PlaceUpsert = Partial<Omit<Place, 'id' | 'created_at' | 'updated_at'>> &
  Pick<Place, 'slug' | 'name' | 'lat' | 'lng' | 'source'>;

export interface SubmissionInsert {
  payload: Record<string, unknown>;
  kind: 'new_place' | 'correction';
  place_id?: string | null;
  ip_hash: string;
}

export interface ReportInsert {
  place_id: string;
  reason: string;
  detail?: string | null;
  ip_hash: string;
}

export interface Db {
  readonly label: string;
  listAreas(): Promise<Area[]>;
  upsertAreas(rows: AreaUpsert[]): Promise<void>;
  listPlaces(): Promise<Place[]>;
  upsertPlaces(rows: PlaceUpsert[], conflictTarget: 'slug' | 'osm_id'): Promise<number>;
  insertSubmissions(rows: SubmissionInsert[]): Promise<number>;
  insertReports(rows: ReportInsert[]): Promise<number>;
  close(): Promise<void>;
}

const PLACE_COLUMNS = [
  'slug',
  'name',
  'area_id',
  'address',
  'lat',
  'lng',
  'categories',
  'food_type',
  'serves_alcohol',
  'last_call',
  'has_shisha',
  'service_modes',
  'hours',
  'hours_verified',
  'price_band',
  'phone',
  'notes',
  'photo_url',
  'status',
  'source',
  'osm_id',
  'verified_at',
  'scrape_hint',
] as const;

// ---------------------------------------------------------------------------
// Direct Postgres
// ---------------------------------------------------------------------------

class PostgresDb implements Db {
  readonly label: string;
  private readonly client: pg.Client;

  constructor(url: string) {
    const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
    this.label = `postgres ${url.replace(/\/\/([^:]+):[^@]+@/, '//$1:***@')}`;
    this.client = new pg.Client({
      connectionString: url,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 20_000,
    });
  }

  private connected = false;

  private async ready(): Promise<pg.Client> {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
    return this.client;
  }

  async listAreas(): Promise<Area[]> {
    const client = await this.ready();
    const { rows } = await client.query<Area>('select * from areas order by sort_order');
    return rows;
  }

  async upsertAreas(rows: AreaUpsert[]): Promise<void> {
    if (rows.length === 0) return;
    const client = await this.ready();
    for (const row of rows) {
      await client.query(
        `insert into areas (slug, name, sort_order, center_lat, center_lng, intro)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (slug) do update set
           name = excluded.name,
           sort_order = excluded.sort_order,
           center_lat = excluded.center_lat,
           center_lng = excluded.center_lng,
           intro = excluded.intro`,
        [row.slug, row.name, row.sort_order, row.center_lat, row.center_lng, row.intro],
      );
    }
  }

  async listPlaces(): Promise<Place[]> {
    const client = await this.ready();
    const { rows } = await client.query<Place>('select * from places');
    return rows;
  }

  async upsertPlaces(rows: PlaceUpsert[], conflictTarget: 'slug' | 'osm_id'): Promise<number> {
    if (rows.length === 0) return 0;
    const client = await this.ready();
    const columns = [...PLACE_COLUMNS];
    // On conflict, never clobber a column the caller did not supply.
    const updates = columns
      .filter((column) => column !== conflictTarget)
      .map((column) => `${column} = coalesce(excluded.${column}, places.${column})`)
      .join(', ');

    let affected = 0;
    for (const row of rows) {
      const values = columns.map((column) => serialize(row[column as keyof PlaceUpsert]));
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
      const { rowCount } = await client.query(
        `insert into places (${columns.join(', ')}) values (${placeholders})
         on conflict (${conflictTarget}) do update set ${updates}`,
        values,
      );
      affected += rowCount ?? 0;
    }
    return affected;
  }

  async insertSubmissions(rows: SubmissionInsert[]): Promise<number> {
    if (rows.length === 0) return 0;
    const client = await this.ready();
    for (const row of rows) {
      await client.query(
        'insert into submissions (payload, kind, place_id, ip_hash) values ($1, $2, $3, $4)',
        [JSON.stringify(row.payload), row.kind, row.place_id ?? null, row.ip_hash],
      );
    }
    return rows.length;
  }

  async insertReports(rows: ReportInsert[]): Promise<number> {
    if (rows.length === 0) return 0;
    const client = await this.ready();
    for (const row of rows) {
      await client.query(
        'insert into reports (place_id, reason, detail, ip_hash) values ($1, $2, $3, $4)',
        [row.place_id, row.reason, row.detail ?? null, row.ip_hash],
      );
    }
    return rows.length;
  }

  async close(): Promise<void> {
    if (this.connected) await this.client.end();
  }
}

function serialize(value: unknown): unknown {
  if (value === undefined) return null;
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Supabase (service role)
// ---------------------------------------------------------------------------

class SupabaseDb implements Db {
  readonly label: string;
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.label = `supabase ${url}`;
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async listAreas(): Promise<Area[]> {
    const { data, error } = await this.client.from('areas').select('*').order('sort_order');
    if (error) throw new Error(`listAreas: ${error.message}`);
    return (data ?? []) as Area[];
  }

  async upsertAreas(rows: AreaUpsert[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.client.from('areas').upsert(rows, { onConflict: 'slug' });
    if (error) throw new Error(`upsertAreas: ${error.message}`);
  }

  async listPlaces(): Promise<Place[]> {
    const pageSize = 1000;
    const all: Place[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await this.client
        .from('places')
        .select('*')
        .range(from, from + pageSize - 1);
      if (error) throw new Error(`listPlaces: ${error.message}`);
      const page = (data ?? []) as Place[];
      all.push(...page);
      if (page.length < pageSize) break;
    }
    return all;
  }

  async upsertPlaces(rows: PlaceUpsert[], conflictTarget: 'slug' | 'osm_id'): Promise<number> {
    if (rows.length === 0) return 0;
    // PostgREST upserts replace the row, so anything the caller omitted would be
    // nulled. Strip undefined keys and let the caller merge before it gets here.
    const cleaned = rows.map((row) =>
      Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined)),
    );
    const { error } = await this.client
      .from('places')
      .upsert(cleaned, { onConflict: conflictTarget });
    if (error) throw new Error(`upsertPlaces: ${error.message}`);
    return rows.length;
  }

  async insertSubmissions(rows: SubmissionInsert[]): Promise<number> {
    if (rows.length === 0) return 0;
    const { error } = await this.client.from('submissions').insert(rows);
    if (error) throw new Error(`insertSubmissions: ${error.message}`);
    return rows.length;
  }

  async insertReports(rows: ReportInsert[]): Promise<number> {
    if (rows.length === 0) return 0;
    const { error } = await this.client.from('reports').insert(rows);
    if (error) throw new Error(`insertReports: ${error.message}`);
    return rows.length;
  }

  async close(): Promise<void> {
    // supabase-js holds no persistent connection.
  }
}

/**
 * Pick a backend: an explicit `--url`/`SUPABASE_DB_URL` wins, otherwise the
 * Supabase service-role client.
 */
export function openDb(): Db {
  const directUrl = flagValue('url') ?? optionalEnv('SUPABASE_DB_URL');
  if (directUrl) return new PostgresDb(directUrl);

  const url = optionalEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = optionalEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error(
      'No database configured. Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in ' +
        '.env.local, or pass --url=postgresql://… for a direct connection.',
    );
  }
  return new SupabaseDb(url, key);
}
