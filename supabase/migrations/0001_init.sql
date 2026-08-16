-- BombayNights — initial schema (docs/02 § Data model)
--
-- Migrations in git are the source of truth. Never hand-edit schema in the
-- Supabase dashboard; add a new numbered migration instead.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type place_status as enum ('pending', 'approved', 'rejected', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  -- 'scraped' per docs/03 Inlet 4 — approved listicle leads keep their provenance.
  create type place_source as enum ('osm', 'manual', 'community', 'scraped');
exception when duplicate_object then null; end $$;

do $$ begin
  create type food_type as enum ('veg', 'nonveg', 'both', 'unknown');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- areas — the Mira Road → Colaba corridor, north to south
-- ---------------------------------------------------------------------------

create table if not exists areas (
  id          serial primary key,
  slug        text unique not null,
  name        text not null,
  sort_order  int not null,
  center_lat  double precision not null,
  center_lng  double precision not null,
  intro       text
);

comment on column areas.sort_order is 'North → south display order. Lower = further north.';
comment on column areas.intro is 'One-line SEO intro shown on /area/[slug].';

-- ---------------------------------------------------------------------------
-- places
-- ---------------------------------------------------------------------------

create table if not exists places (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  area_id         int references areas (id),
  address         text,
  lat             double precision not null,
  lng             double precision not null,
  categories      text[] not null default '{}',
  food_type       food_type not null default 'unknown',
  serves_alcohol  boolean,
  last_call       time,
  has_shisha      boolean,
  service_modes   text[] not null default '{}',
  hours           jsonb,
  hours_verified  boolean not null default false,
  price_band      smallint,
  phone           text,
  notes           text,
  photo_url       text,
  status          place_status not null default 'pending',
  source          place_source not null,
  osm_id          text unique,
  verified_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint places_lat_range check (lat between -90 and 90),
  constraint places_lng_range check (lng between -180 and 180),
  constraint places_price_band_range check (price_band is null or price_band between 1 and 4)
);

comment on column places.hours is
  'Normalized weekly hours: {"mon":[{"open":"19:00","close":"02:30"}],...}. '
  'close <= open means the window crosses midnight. [] = closed that day. '
  'null = hours unknown — the UI must say "hours unverified", never "open now".';
comment on column places.serves_alcohol is 'null = unknown, deliberately tri-state.';
comment on column places.hours_verified is
  'True only when a human confirmed the real late-night behaviour. Drives the ✓ badge. '
  'Machines must never flip this to true.';
comment on column places.osm_id is 'e.g. node/123456 — used to diff on monthly refresh.';

create index if not exists places_status_idx on places (status);
create index if not exists places_area_id_idx on places (area_id);
create index if not exists places_categories_idx on places using gin (categories);
create index if not exists places_status_area_idx on places (status, area_id);

-- ---------------------------------------------------------------------------
-- submissions — anonymous community input. Never written directly to places.
-- ---------------------------------------------------------------------------

create table if not exists submissions (
  id          uuid primary key default gen_random_uuid(),
  payload     jsonb not null,
  kind        text not null default 'new_place',
  place_id    uuid references places (id) on delete set null,
  ip_hash     text not null,
  status      place_status not null default 'pending',
  admin_note  text,
  created_at  timestamptz not null default now(),

  constraint submissions_kind_check check (kind in ('new_place', 'correction'))
);

comment on column submissions.ip_hash is
  'sha256(ip + daily salt). Rotates daily so it cannot be used to track anyone '
  'across days — it exists only to rate limit.';

create index if not exists submissions_status_idx on submissions (status);
create index if not exists submissions_ip_hash_created_idx on submissions (ip_hash, created_at);

-- ---------------------------------------------------------------------------
-- reports — one-tap "timing is wrong" from place pages
-- ---------------------------------------------------------------------------

create table if not exists reports (
  id          uuid primary key default gen_random_uuid(),
  place_id    uuid not null references places (id) on delete cascade,
  reason      text not null,
  detail      text,
  ip_hash     text not null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),

  constraint reports_reason_check check (
    reason in (
      'closed_when_listed_open',
      'wrong_hours',
      'shut_down',
      'osm_hours_drifted',
      'other'
    )
  )
);

comment on column reports.reason is
  'osm_hours_drifted is filed by the monthly refresh when OSM disagrees with '
  'owner-verified hours — machines propose, the owner disposes.';

create index if not exists reports_place_id_idx on reports (place_id);
create index if not exists reports_unresolved_idx on reports (created_at) where resolved_at is null;
create index if not exists reports_ip_hash_created_idx on reports (ip_hash, created_at);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists places_set_updated_at on places;
create trigger places_set_updated_at
  before update on places
  for each row execute function set_updated_at();
