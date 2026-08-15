# 03 — Data & Seeding (no Google, ₹0)

Three inlets, one table. Everything lands in `places` with the right `source`
and `status='pending'` (owner approves in `/admin`). Seeded places with
plausible late-night hours can be bulk-approved but stay `hours_verified=false`
until the owner confirms them.

## Inlet 1 — OpenStreetMap via Overpass API (`scripts/seed-osm.ts`)

Free, no key, no billing. Be a good citizen: single bulk query per area chunk,
2s+ between requests, custom `User-Agent: BombayNights-seed/1.0`.

**Geography:** the corridor Mira Road–Bhayandar → Colaba. Query per-area using
bounding boxes defined in `scripts/areas.ts` (single source for both the
`areas` table and seed queries). Area list (north → south):

Mira Road–Bhayandar, Dahisar–Borivali, Kandivali–Malad, Goregaon, Jogeshwari–
Andheri, Vile Parle–Juhu, Santacruz–Khar, Bandra, Mahim–Dadar, Lower Parel–
Worli, Byculla–Mumbai Central, Girgaon–Marine Lines, Fort–Colaba (SoBo).

**Overpass query per bbox** (nodes + ways; use `center` for way coords):

```
[out:json][timeout:60];
(
  nwr["amenity"~"^(restaurant|bar|cafe|fast_food|pub|nightclub|food_court|ice_cream)$"]({{bbox}});
  nwr["shop"~"^(bakery|convenience)$"]["opening_hours"]({{bbox}});
  nwr["amenity"="hookah_lounge"]({{bbox}});
);
out center tags;
```

**Pipeline per element:**
1. Zod-validate; drop entries with no name.
2. Parse `opening_hours` (npm `opening_hours` package) → normalized `hours`
   JSONB. Unparseable → `hours = null`.
3. Classify:
   - `hours` present and `isLateNight(hours)` → include, flag `late_night`
   - `hours = null` but amenity is bar/pub/nightclub/hookah_lounge → include
     anyway (these skew late; owner verifies)
   - `hours` present but closes before midnight → **skip** (keeps DB honest)
4. Map tags → schema: `amenity` → categories; `diet:vegetarian=only` →
   `food_type='veg'`; `cuisine` → extra category tags; phone/addr fields.
5. Upsert on `osm_id`. Never overwrite owner-edited rows (see refresh rules).

**Reality check (build for this):** OSM hours coverage in Mumbai is thin —
expect a few hundred usable late-night entries, not thousands. That's the
bootstrap, not the product. The seed report (`scripts/output/seed-report.md`)
must list per-area counts of included / skipped / no-hours entries so the owner
knows where manual work is needed.

## Inlet 2 — Manual CSV (`data/manual-seed.csv`) — the owner's moat

The highest-quality data. Ship the CSV with a header row + 8–10 example rows
of famous, publicly known late-night Mumbai spots (e.g., Bademiya Colaba,
Ayub's Fort, Sardar Pav Bhaji Tardeo — mark example hours `hours_verified=false`
so the owner confirms), then the owner extends it over time.

```csv
name,area_slug,lat,lng,address,categories,food_type,serves_alcohol,last_call,has_shisha,service_modes,hours_json,price_band,phone,notes
```

`scripts/seed-manual.ts`: parse, Zod-validate, upsert by `slug`
(slugified name + area), `source='manual'`. Bad rows → clear error with row
number, don't silently skip. Manual rows **always win** over OSM rows at the
same location (dedupe: same normalized name within 150m).

## Inlet 3 — Community submissions

Covered in docs/04 (public submit form) — inserts into `submissions`, owner
approval copies payload into `places` with `source='community'`.

## Inlet 4 — Listicle discovery scraper (`scripts/scrape-leads.ts`)

Purpose: **lead discovery, never published data.** Mumbai late-night blog
listicles (LBB, Curly Tales, Tripoto, etc.) are human-curated discovery that
OSM lacks. URLs live in `data/scrape-sources.json` (owner-maintained list).

Rules (hard):
- Check and respect `robots.txt`; identify with UA `BombayNights-leads/1.0`;
  ≥5s between requests; total scope is tens of pages, not thousands.
- **NEVER scrape Zomato, Swiggy, Google Maps, or any platform whose ToS
  prohibits it.** Editorial blog posts only.
- Extract **facts only**: place name, area/locality, claimed timing string.
  Never store or republish article prose, images, or rankings.
- Pipeline: fuzzy-match name+area against existing `places` (normalized name,
  same area). Unknown → insert `submissions` row, `kind='new_place'`,
  `source_hint='scraped'`, payload includes claimed timing as a hint and the
  source URL for the owner's reference. Known → if claimed timing conflicts
  with an unverified place's hours, file a `reports` row for review.
- Scraped leads NEVER go straight to `places` — always through the pending
  queue. Claimed timings are hints, not data; only owner verification makes
  them real.
- Extraction can be dumb (cheerio + heuristics for `<h2>/<h3>` place-name
  patterns) — a 70%-recall scraper that never breaks beats a clever brittle
  one. Log misses; the owner can eyeball source pages for the rest.
- Run manually or quarterly via `workflow_dispatch`; not part of the monthly
  OSM refresh.

Add `'scraped'` to the `place_source` enum in the docs/02 schema so approved
leads keep their provenance.

## Monthly refresh (`.github/workflows/monthly-refresh.yml`)

Cron `0 22 1 * *` (1st of month, 03:30 IST). Runs `seed-osm.ts --diff`:

- **New** OSM places → insert as `pending`
- **Changed** hours/tags where `hours_verified=false` → update in place
- **Changed** where `hours_verified=true` → do NOT touch data; file a row in
  `reports` (reason `osm_hours_drifted`) for the owner to review
- **Vanished** from OSM → never delete; report only
- Job output: markdown summary posted as a GitHub issue on the repo

Owner-verified data is never machine-overwritten. Machines propose, the owner
disposes.

## Category tag vocabulary (fixed list, enforce with Zod enum)

`bar`, `pub`, `nightclub`, `restaurant`, `cafe`, `street_food`, `fast_food`,
`dessert`, `bakery`, `dhaba`, `shisha_lounge`, `rooftop`, `24x7`, `late_night`,
plus cuisine tags: `chinese`, `mughlai`, `south_indian`, `north_indian`,
`seafood`, `rolls_kebabs`, `pav_bhaji`, `biryani`, `pizza`, `burgers`,
`chai_coffee`, `juice_falooda`.

Derived, not stored: `open_now`, `closing_soon` (≤45 min) — computed live.
