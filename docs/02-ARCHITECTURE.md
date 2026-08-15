# 02 — Architecture

## Stack (all free tier)

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 15 (App Router, TypeScript strict) | SSR for SEO area pages + API routes in one deploy |
| Styling | Tailwind CSS | Fast, small, no runtime |
| Database | Supabase Postgres (Free) | Real SQL, RLS, auth, ap-south-1 region |
| Auth | Supabase Auth, email OTP, admin only | One user; zero password handling |
| Map | Leaflet + OpenStreetMap raster tiles | Free forever; Google Maps JS is billed |
| Hosting | Vercel Hobby | Free SSR + edge |
| Cron | GitHub Actions (monthly) | Free; Vercel Hobby cron is limited |
| Validation | Zod everywhere | Overpass, forms, query params |

Keep dependencies minimal. No ORM required — use `supabase-js`; write schema as
plain SQL migration files in `supabase/migrations/` so the DB is reproducible.

## Data model

```sql
-- Enums
create type place_status as enum ('pending', 'approved', 'rejected', 'archived');
create type place_source as enum ('osm', 'manual', 'community', 'scraped');
create type food_type   as enum ('veg', 'nonveg', 'both', 'unknown');

create table areas (
  id          serial primary key,
  slug        text unique not null,   -- 'bandra'
  name        text not null,          -- 'Bandra'
  sort_order  int not null,           -- north→south display order
  center_lat  double precision not null,
  center_lng  double precision not null
);

create table places (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,          -- 'bademiya-colaba'
  name            text not null,
  area_id         int references areas(id),
  address         text,
  lat             double precision not null,
  lng             double precision not null,
  categories      text[] not null default '{}',  -- see tag vocabulary below
  food_type       food_type not null default 'unknown',
  serves_alcohol  boolean,                        -- null = unknown
  last_call       time,                           -- bar last order, if known
  has_shisha      boolean,
  service_modes   text[] not null default '{}',  -- 'dine_in','takeaway','car_dining','delivery_only'
  hours           jsonb,                          -- normalized weekly hours, see below
  hours_verified  boolean not null default false,
  price_band      smallint,                       -- 1..4 (₹ to ₹₹₹₹), null ok
  phone           text,
  notes           text,                           -- owner's one-liner, shown on card/detail
  photo_url       text,                           -- optional, external or Supabase storage
  status          place_status not null default 'pending',
  source          place_source not null,
  osm_id          text unique,                    -- 'node/123', for refresh diffing
  verified_at     timestamptz,                    -- when owner last confirmed data
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on places (status);
create index on places (area_id);
create index on places using gin (categories);

-- Anonymous community submissions land here, NOT in places
create table submissions (
  id           uuid primary key default gen_random_uuid(),
  payload      jsonb not null,        -- same shape as a place, zod-validated
  kind         text not null default 'new_place',  -- or 'correction'
  place_id     uuid references places(id),          -- set when kind='correction'
  ip_hash      text not null,         -- sha256(ip + daily salt), for rate limiting
  status       place_status not null default 'pending',
  admin_note   text,
  created_at   timestamptz not null default now()
);

-- One-tap “timing is wrong” reports from place pages
create table reports (
  id         uuid primary key default gen_random_uuid(),
  place_id   uuid not null references places(id),
  reason     text not null,           -- 'closed_when_listed_open' | 'wrong_hours' | 'shut_down' | 'other'
  detail     text,
  ip_hash    text not null,
  created_at timestamptz not null default now()
);
```

### `hours` JSONB format (normalized, the single source of truth)

Seven keys `mon..sun`; each an **array of windows** in 24h `HH:MM`. A window
whose `close` ≤ `open` crosses midnight into the next day.

```json
{
  "mon": [{ "open": "11:00", "close": "02:30" }],
  "tue": [{ "open": "11:00", "close": "02:30" }],
  "fri": [{ "open": "11:00", "close": "04:00" }],
  "sat": [{ "open": "00:00", "close": "24:00" }],
  "sun": []
}
```

- `[{"open":"00:00","close":"24:00"}]` = 24 hours that day; `[]` = closed.
- Parse OSM `opening_hours` strings into this format at seed time using the
  `opening_hours` npm package; never store raw OSM strings in `hours`.

## The open-now engine (`lib/openNow.ts`) — highest-risk code, TDD it

Pure functions, exhaustively unit-tested (Vitest), **always computed in
`Asia/Kolkata`** via `Intl.DateTimeFormat` parts — never the runtime's local TZ.

```
isOpenAt(hours, date) -> boolean
  // A place open Fri 19:00–02:30 IS open Sat 01:00. Check both “today's
  // windows” and “yesterday's windows that spill past midnight.”
closesAt(hours, date) -> { time: "02:30", overnight: boolean } | null
minutesUntilClose(hours, date) -> number | null
isLateNight(hours) -> boolean
  // true if ANY window intersects 00:00–06:00 on ANY day (seed filter + badge)
nextOpening(hours, date) -> { day, time } | null   // for “opens 7 PM” states
```

Test cases that MUST exist: overnight spill (Fri 19:00–02:30 at Sat 01:00 ✓,
Sat 03:00 ✗), 24h days, closed days, exact-boundary minutes (02:30 sharp),
places with `hours = null` (never "open now", surface as "hours unverified"),
week wraparound (Sun overnight into Mon).

## Sorting & distance

≤5k rows: fetch approved places once (server-side), compute distance with a
haversine helper when the visitor shares location, sort client-side:
**open-now first → closing-latest → distance**. No PostGIS needed in V1; note
in DECISIONS.md that PostGIS is the upgrade path if the dataset grows 10x.

## Security model (RLS is the wall, app code is convenience)

- `places`: anon role can `select` **only** `status = 'approved'`. No
  anon insert/update/delete.
- `submissions`/`reports`: no anon access at all. Public API routes insert
  using the service-role key **server-side** after Zod validation + rate limit
  (max 5 submissions + 10 reports per ip_hash per day; honeypot field on forms).
- `/admin` + admin API routes: require a Supabase session whose email equals
  `ADMIN_EMAIL` (checked server-side on every admin request).
- Never ship the service-role key to the client bundle (verify in Phase 4).

## Caching & performance

- Approved-places dataset served via a single cached server call
  (`revalidate: 300`); "open now" is computed client-side each render, so
  cached data stays correct as the clock ticks.
- Leaflet loaded lazily only when the user opens map view.
- Budget: < 150KB first-load JS on the list page; Lighthouse mobile ≥ 90.
