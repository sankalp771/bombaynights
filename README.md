# BombayNights

Everything open in Mumbai between **12 AM and 6 AM** — restaurants, bars, street
food, shisha lounges. Mira Road to Colaba. Owner-curated timings, anonymous
community submissions, no login to browse.

**Live:** https://bombaynights.vercel.app

Built to run at ₹0/month: Next.js 15 on Vercel Hobby, Supabase Free (ap-south-1),
OpenStreetMap data via Overpass, Leaflet + OSM tiles, GitHub Actions for the
OSM refresh. There is no paid API anywhere in this repo and there is no billing
account behind it — keep it that way. Google and the aggregators are link-outs
only: a Maps URL is not an API and costs nothing.

---

## Quick start

```bash
npm ci
cp .env.example .env.local     # fill in the five app variables
npm run dev                    # http://localhost:3000
```

Checks:

```bash
npm test          # 194 unit tests
npm run typecheck # tsc --noEmit, strict
npm run lint
npm run test:tz   # the whole suite under UTC, New York and Kolkata
```

`test:tz` is not decoration. Every open/closed judgement must land in
`Asia/Kolkata` no matter what timezone the machine is in, and the suite is run
three times over to prove it.

### Environment variables

Five for the app, in `.env.local` (and in Vercel → Settings → Environment
Variables, Production **and** Preview):

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key. Ships to browsers — safe only because RLS refuses everything except approved places |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS. Server-side only; never import into a client component |
| `ADMIN_EMAIL` | The single address allowed into `/admin` |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin. **Optional on Vercel** — see below |

Two more for tooling only, in `.env.db.local` — kept out of `.env.local` so
Next.js can never read them at runtime: `SUPABASE_ACCESS_TOKEN` (migrations over
HTTPS) and `SUPABASE_DB_URL` (direct Postgres, local work only). Both files are
gitignored. See `.env.example` for the annotated list.

#### About `NEXT_PUBLIC_SITE_URL`

It drives `metadataBase`, every canonical and OG tag, `robots.txt`, and all 27+
URLs in `sitemap.xml`. **On Vercel you can leave it unset** — `lib/siteUrl.ts`
falls back to `VERCEL_PROJECT_PRODUCTION_URL`, which is always the real
production domain. Set it explicitly only when you move to a custom domain.

Obvious template values (`CHANGE-ME`, `your-domain`, `example.com`) are treated
as *unset* and fall through to the Vercel domain. That guard exists because
production once shipped with `https://CHANGE-ME.vercel.app` and published an
entire sitemap of dead URLs — silently, since every page still rendered fine.

---

## How the data gets in

Five inlets, described fully in `docs/03-DATA-AND-SEEDING.md`.

```bash
npm run seed:areas     # the 13 corridor areas — run once
npm run seed:osm       # Overpass → parse → classify → upsert (15–30 min)
npm run seed:manual    # data/manual-seed.csv → upsert
npm run scrape:leads   # listicle leads → submissions queue
npm run scrape:chains  # chain outlets from the brand's own site (~5 min)
```

Every one takes `--dry-run` (fetch, report, write nothing). `seed:osm` also
takes `--fixture=<file>` to work entirely offline and `--area=<slug>` to redo a
single area; `scrape:chains` takes `--limit=<n>` to prove the parse on a few
pages first.

All seeding is **idempotent** — re-running inserts nothing new. If Overpass
rate-limits you mid-run (it will; it's a shared free service), just re-run the
area it dropped.

Rules that hold across every inlet:

- Machine-sourced rows land as **`pending`**, never straight onto the site.
  Manual CSV rows land as `approved`, because you wrote them.
- **Owner-verified rows are never machine-overwritten**, and archived or
  rejected rows are never resurrected.
- Manual beats OSM within 150 m for the same name — that's the dedupe rule.
- A place whose hours we can't parse is **never** shown as open. It reads
  "Hours unverified".
- **Aggregators are forbidden.** Zomato, Swiggy, Google and TripAdvisor are
  link-out only, never scraped. `scrape:chains` reads a *brand's own* site
  (McDonald's India today) because a company keeps its own outlet list current
  — and takes only facts the page publishes as schema.org microdata: outlet
  name, timings, coordinates. Never menus, prices or prose.

### A note on timings from delivery sites

A brand's ordering window is **not** its visit window — dine-in usually shuts
earlier. Publishing one as the other would eventually walk someone to a closed
shutter, which is the one unforgivable failure here. So `scrape:chains` does not
write its window into `hours`; outlets ship hours-unknown and read "unverified"
publicly. The scraped window goes to the admin-only `scrape_hint` column, shown
beside the row while you confirm the real close. Public queries never select it.

### Coordinates are machine-sourced or absent

Nothing ever asks a human for a latitude. OSM, manual and chain seeds carry real
coordinates; a community submission carries only an address and has **no pin**
(`lat`/`lng` are nullable as of migration 0003). Such a place stays off the map,
sorts last in "near me", and its directions link falls back to the address text —
Google resolves it fine.

There is deliberately no geocoder. One was built and removed the same day: on a
real submission it returned a confident locality-level pin for the wrong
building, and a plausible-but-wrong pin is worse than none. **Verification is one
gesture instead:** every name and address links out to that place's Google Maps
card, where liveness, hours and location are all visible at once. That is how a
"permanently closed" McDonald's got caught in the OSM leads.

### Adding places yourself

Append to `data/manual-seed.csv`, then `npm run seed:manual`. This is the
highest-value thing you can do: OSM's Mumbai hours coverage is thin, and galli
joints, car-dining spots and new lounges are simply not in it.

---

## Moderating

`/admin`, email OTP, locked to `ADMIN_EMAIL`. Nobody else can get in — the check
is re-run inside every admin read and every Server Action, not once in a layout
(a Server Action is a public endpoint that no layout runs before).

- **Queue** — anonymous submissions and corrections. Corrections show a diff;
  use judgment, the reporter can be wrong. Approving a new place writes it to
  `places` as `approved` / `source='community'`. A submission needs no
  coordinates to be approved.
- **Places** — inline edit, bulk approve, the verify toggle, and archive or
  hard delete (per-row and bulk, two-tap confirm).
- **Reports** — wrong-timing reports from visitors, plus `osm_hours_drifted`
  rows filed by a refresh run.

### Verify with the Google card

Every place name and address in the admin links out to that place's Google Maps
card. That one gesture shows liveness, current hours and location together —
including a "Permanently closed" banner, which is how a dead McDonald's got
caught in the OSM leads. It is the intended verification step, not a shortcut.

Where a chain outlet was seeded from a brand's delivery site, its ordering
window sits beside the row as a `scrape_hint`. Treat it as a lead, not an
answer: confirm the real dine-in close on the Google card before you set `hours`.

### Archive vs delete

**Archive is the delete that survives re-seeding.** A hard-deleted row leaves no
tombstone, so a later `seed:osm` re-run sees it as new and re-inserts it as
pending. Archive marks it dead permanently.

Hard delete exists because the OSM cron is off — nothing re-imports on a
schedule any more. Use it for junk no seeder will re-fetch, and archive for
anything you want gone for good.

### The ✓ badge is the whole brand

`hours_verified` is flipped **by humans only**. When you (or someone you trust)
have actually confirmed a place's real late-night behaviour, set exact `hours`,
tags and `last_call`, then flip it. Machines propose, the owner disposes: a
refresh run files a report against a verified place rather than editing it.

Spend that badge carefully — it is the only reason to use this site over
guessing.

### Supabase setup — do this once, or login does not work

`signInWithOtp` sends exactly one email, and **the project's email template
decides whether it carries a typed code or a clickable link**. Supabase's
stock template sends a link; this login form asks for a code. Left alone, the
form waits for something that never arrives — which is precisely how this failed
in production.

**Editing that template requires custom SMTP.** On the default setup Supabase
shows "Set up custom SMTP to edit templates" and the body is read-only, so there
is no way to surface the code without this step. Custom SMTP is free:

1. **Get free SMTP credentials.** [Resend](https://resend.com) (3,000/month) or
   [Brevo](https://brevo.com) (300/day) both work, as does a Gmail account with
   an [app password](https://myaccount.google.com/apppasswords). One admin
   receiving login codes will never approach any of these limits.
2. **Supabase → Authentication → Emails → SMTP Settings** → enable custom SMTP,
   fill in host, port, user, password and a sender address.
3. **Authentication → Emails → Magic link or OTP** — the body is now editable.
   Set it to include `{{ .Token }}`:

   ```html
   <h2>Your BombayNights sign-in code</h2>
   <p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
   <p>It expires in an hour. If you did not ask for it, ignore this email.</p>
   ```

4. **Authentication → URL Configuration → Redirect URLs** — add
   `https://<your-domain>/auth/callback`.

Step 4 is only for the link fallback: `/auth/callback` exchanges a link's code
for a session so a stray link lands somewhere useful instead of dumping you on
the homepage with `?code=` in the URL. It works only in the browser that
requested it, because PKCE keeps the verifier in a cookie there. **The typed
code is the reliable path** — it is why the form leads with it, and why steps
1–3 are not optional.

Custom SMTP has a second benefit: Supabase's built-in email service is capped at
**2 emails per hour** on the free tier, which is easy to hit while testing a
login flow. Your own SMTP replaces that cap with the provider's.

---

## OSM refresh (manual only)

`.github/workflows/monthly-refresh.yml` runs `seed-osm.ts --diff` and files the
markdown report as a GitHub issue labeled `refresh-report`.

**The monthly cron is switched off.** OSM turned out to be the weakest source —
it produced dead entries, including a McDonald's that had been permanently
closed for a while — and with hard delete now available, an automatic re-import
would quietly resurrect rows you had deleted. So the workflow is
`workflow_dispatch` only: it runs when you ask it to, never on a schedule.

Repo secrets needed (Settings → Secrets and variables → Actions):
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

Manual runs take two optional inputs: **dry run** (write nothing — a safe first
test) and **area** (redo one slug after an Overpass drop-out).

What it does with what it finds:

| In OSM | In our DB | Action |
|---|---|---|
| New | — | Insert as `pending` |
| Changed | `hours_verified = false` | Update in place |
| Changed | `hours_verified = true` | **Don't touch.** File an `osm_hours_drifted` report |
| Gone | exists | **Never delete.** Report only |

Act only on drift reports for verified places. Nothing user-facing depends on
this job — if Overpass is down, the affected areas are skipped and the report
says so.

> ⚠️ **Running it can bring back places you hard-deleted.** A deleted OSM row has
> no tombstone, so a re-run sees it as new and re-inserts it as `pending`.
> **Archive is the delete that survives re-seeding** — use it for anything you
> want gone permanently, and save hard delete for junk you know no seeder will
> re-fetch.

> **Note on the runner:** the workflow deliberately does not set
> `SUPABASE_DB_URL`. The seed scripts prefer a direct Postgres URL whenever they
> see one, and GitHub runners can't open outbound port 5432 to Supabase — it
> would hang, then fail. The HTTPS/PostgREST path is the one that works. Same
> reason `npm run db:push` uses Supabase's Management API when
> `SUPABASE_ACCESS_TOKEN` is set.

---

## Migrations

Source of truth is `supabase/migrations/` in git. Never paste SQL into the
dashboard.

```bash
npm run db:push -- --status    # what's applied
npm run db:push -- --dry-run   # what would run
npm run db:push                # apply
```

Works over HTTPS with `SUPABASE_ACCESS_TOKEN` set, which is what makes it usable
from CI and sandboxes. A direct `--url=postgres://…` wins when given.

| Migration | What it does |
|---|---|
| `0001_init` | Tables, enums, indexes |
| `0002_rls` | Row-level security policies |
| `0003_nullable_pin` | `lat`/`lng` become nullable — community places have no pin |
| `0004_scrape_hint` | Admin-only column for a scraped delivery window |

## Security model

- Anonymous browsing, anonymous submissions, **no visitor login ever**.
- The anon key can read `approved` places and the area list. Nothing else —
  enforced by RLS, not by app code. `npm run rls:test:live` proves it through
  PostgREST with the real public key, which is exactly the surface an attacker
  has.
- Every public write goes through a server route with Zod validation, a
  honeypot field and an IP-hash rate limit.
- The service-role key is server-only and verified absent from the client
  bundle.

```bash
npm run rls:test:live   # against the real project
npm run rls:test -- --url=…   # against a local database
```

## Working offline

Phases 0–3 were built with no network at all:

```bash
scripts/local-db.sh start
npm run db:push -- --url=$(scripts/local-db.sh url) --local --fresh
npm run seed:areas  -- --url=$(scripts/local-db.sh url)
npm run seed:osm    -- --fixture=data/fixtures/overpass-sample.json --url=$(scripts/local-db.sh url)
npm run seed:manual -- --url=$(scripts/local-db.sh url)
```

Then point the app at it via `.env.development.local`:

```
BN_DB_DRIVER=postgres
SUPABASE_DB_URL=postgresql://postgres@127.0.0.1:54329/postgres
```

---

## Tag vocabulary

Fixed list, Zod-enforced in `lib/types.ts`. Don't add to it casually — filters,
seeding and the OSM classifier all key off it.

**Venue:** `bar` `pub` `nightclub` `restaurant` `cafe` `street_food` `fast_food`
`dessert` `bakery` `dhaba` `shisha_lounge` `rooftop` `24x7` `late_night`

**Cuisine:** `chinese` `mughlai` `south_indian` `north_indian` `seafood`
`rolls_kebabs` `pav_bhaji` `biryani` `pizza` `burgers` `chai_coffee`
`juice_falooda`

`open_now` and `closing_soon` (≤45 min) are **derived, never stored** — computed
live in the browser.

## Analytics

Vercel Web Analytics, page views only. Custom events are Pro-only, so
directions/phone taps aren't tracked; because every place has its own URL,
per-place popularity still shows up as page views. Hobby gives 50k events/month
and a 1-month reporting window. Enable it once in the Vercel dashboard →
Analytics tab; the `<Analytics />` component is already in the root layout.

## Things that will bite you

- **`next build` overwrites `.next` under a running `next dev`.** Kill the dev
  server first or it 500s afterwards.
- **`pg` returns `Date` objects where PostgREST returns ISO strings.** Handled by
  a `z.preprocess` in `lib/types.ts` — keep new timestamp columns going through
  it.
- **OSM rule-override semantics genuinely truncate closing times** at rule
  boundaries. That reads as a bug and isn't one; under-stating is the safe
  direction. Read the entry in `DECISIONS.md` before "fixing" it.
- **Never cache "open now."** The dataset is cached for five minutes; the
  open/closed judgement is recomputed in the browser on a timer.
- **Supabase Free pauses a project after ~1 week of inactivity**, and now that
  the refresh cron is off, nothing in this repo keeps it awake on a schedule.
  Real traffic does; a quiet week may not. If you ever find a paused project,
  add a weekly ping job to `monthly-refresh.yml` — that's the documented first
  move.
- **A hard-deleted OSM place comes back if you re-run `seed:osm`.** There is no
  tombstone, so the re-run sees it as new. Archive instead when you want it gone
  for good.
- **Don't validate the sign-in code's length.** Supabase's OTP length is a
  project setting, not a constant. The form once demanded exactly six digits
  against a project issuing eight, which rejected valid codes *and* truncated
  them as they were typed. `verifyOtp` is the only thing that can judge a code.

## Repo layout

```
app/          routes — public pages, /admin, /api, /auth/callback
components/   UI
lib/          open-now engine, IST time, data access, validation, types,
              siteUrl (canonical origin), maps (Google link-outs)
scripts/      seeding, scraping, migrations, RLS tests
supabase/     migrations (source of truth)
data/         manual-seed.csv, scrape sources, test fixtures
docs/         the original build spec, 00 → 06
DECISIONS.md  append-only log of judgment calls and why
```

Read `docs/` for the spec and `DECISIONS.md` before changing anything that looks
odd — most of the odd things are load-bearing.

## Attribution

Place data from [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors, [ODbL](https://opendatacommons.org/licenses/odbl/). Displaying
this attribution on the map and in the footer is a licence requirement, not a
courtesy — don't remove it.
