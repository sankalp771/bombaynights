# HANDOFF — read this first

State of the BombayNights build as of **2026-08-16**, for whoever (or whatever)
picks it up next. Read `CLAUDE.md` and `docs/` for the spec; read `DECISIONS.md`
for why things are the way they are. This file is just: where we got to, what is
proven, and what to do next.

Branch: **`claude/project-kickoff-50xpah`** (all work is pushed here).

---

## Where the build is

| Phase | Status | Notes |
|---|---|---|
| 0 — Skeleton | ✅ done | Next.js 15, TS strict, Tailwind v4, ESLint/Prettier/Vitest |
| 1 — Schema + open-now engine | ✅ done | Migrations + RLS + `lib/openNow.ts`, all proven against a real Postgres |
| 2 — Seeding | ✅ done | OSM / manual CSV / listicle leads, all with `--dry-run` and `--fixture` |
| 3 — Public site | ✅ done | Landing, list, detail, area, submit, about, map, PWA, sitemap |
| 4 — Admin | ⬜ **next** | Email-OTP login, queue, places editor, reports tab |
| 5 — Deploy + ops | ⬜ not started | Vercel, prod migrations + seed, monthly-refresh Action, final README |

147 tests green. `typecheck` and `lint` clean. `/places` first-load JS is 128 kB
against the 150 kB budget.

## What is actually verified (not just written)

- Migrations apply cleanly to a fresh Postgres 16.
- **15/15 RLS checks pass** — anon cannot read pending/rejected/archived places,
  cannot write anything, cannot touch `submissions` or `reports`.
- `openNow` passes identically under `TZ=UTC`, `America/New_York`,
  `Asia/Kolkata`, `Pacific/Kiritimati`.
- Seeding is idempotent: 20 rows, 20 distinct slugs, a re-run inserts none.
- Manual CSV rows take over matching OSM rows instead of duplicating them.
- A place with hours `19:00–02:30` reads open at 01:30 IST and shut at 05:50 IST.
- No horizontal overflow at 390 px on any page.
- Service-role key is absent from `.next/static`.
- Submit accepts 5 from one source and rejects the 6th with 429; honeypot hits
  are swallowed with a 201.

## The one big blocker

**Nothing has touched the real Supabase project yet.** The session this was built
in had a network policy that blocked `*.supabase.co` and Overpass, so everything
was proven against a local Postgres instead.

The owner has created a cloud environment named **"supa open street"** with
Custom network access allowing `*.supabase.co`, `api.supabase.com`,
`overpass-api.de`, `overpass.kumi.systems`, `tile.openstreetmap.org` (plus the
default package-manager list). **Start sessions on that environment.**

⚠️ **The allowlist governs an HTTP/HTTPS proxy. Postgres on port 5432 is raw TCP
and stays blocked regardless.** So:

- ✅ `seed:areas`, `seed:osm`, `seed:manual`, `scrape:leads` work — they default
  to supabase-js over HTTPS.
- ❌ `db:push` does **not** — it connects with `pg` over TCP.

Three ways to apply the migrations, pick one:

1. **Owner runs `npm run db:push` from their own laptop.** Simplest; they have
   the DB URL. Recommended.
2. Add a Management API transport to `scripts/db-push.ts` (HTTPS,
   `POST https://api.supabase.com/v1/projects/{ref}/database/query`). Needs a
   Supabase personal access token from the owner. Do this if migrations should
   be runnable from a session going forward.
3. Paste `supabase/migrations/*.sql` into the Supabase SQL editor once. Works,
   but docs/06 says migrations in git are the source of truth — one-off only.

## Credentials

`.env.local` is gitignored and **does not exist in a fresh clone**. Ask the owner
to paste these, or set them as environment variables on the cloud environment:

```
NEXT_PUBLIC_SUPABASE_URL=https://dronsbinrjjhbkiqrmfv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key — bypasses RLS, treat carefully>
ADMIN_EMAIL=sankalpiit15@gmail.com
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

The owner pasted the service-role key and the DB password into a chat transcript
during the Phase 0–3 session. **Rotating both in the Supabase dashboard is
outstanding.**

## First moves in a new session

```bash
npm ci

# 1. Migrations — see the three options above. If running locally:
npm run db:push

# 2. Seed, in this order
npm run seed:areas
npm run seed:osm          # add --dry-run first to see the report
npm run seed:manual
cat scripts/output/seed-report.md

# 3. Prove the security model against the real project
npm run rls:test -- --url=<direct postgres url>   # needs TCP; run locally

# 4. Then start Phase 4 (docs/05)
```

## Developing without network access

Everything can be run offline, which is how phases 0–3 were built:

```bash
scripts/local-db.sh start                     # local Postgres on :54329
npm run db:push -- --url=$(scripts/local-db.sh url) --local --fresh
npm run seed:areas -- --url=$(scripts/local-db.sh url)
npm run seed:osm -- --fixture=data/fixtures/overpass-sample.json --url=$(scripts/local-db.sh url)
npm run seed:manual -- --url=$(scripts/local-db.sh url)
npm run rls:test -- --url=$(scripts/local-db.sh url)
```

To run the site against that local DB, put this in `.env.development.local`
(gitignored):

```
BN_DB_DRIVER=postgres
SUPABASE_DB_URL=postgresql://postgres@127.0.0.1:54329/postgres
```

`lib/data.ts` picks up that driver and dynamically imports `pg`, so it is never
bundled in a normal Supabase deployment. Production only ever talks to Supabase
with the anon key, through RLS.

## Things that will bite you

- **`next build` overwrites `.next` under a running `next dev`.** Kill the dev
  server before building, or it 500s afterwards.
- **Seeded OSM rows land as `pending`,** so the public site shows nothing until
  they are approved. That is correct behaviour, not a bug — approve them in
  `/admin` (Phase 4) or with SQL while developing.
- **`pg` returns `Date` objects where PostgREST returns ISO strings.** Already
  handled by a `z.preprocess` in `lib/types.ts`; keep new timestamp columns going
  through it.
- **OSM rule-override semantics genuinely truncate closing times** at rule
  boundaries (`Mo-Th 18:00-01:00; Fr-Sa 18:00-03:00` really does evaluate with
  Thursday closing at 00:00). We keep the spec-correct reading because
  under-stating is the safe direction, and the seed report lists every affected
  row under "Verify these first". Do not "fix" this without reading the entry in
  `DECISIONS.md`.
- **Do not cache "open now".** The dataset is cached for five minutes; the
  open/closed judgement is recomputed in the browser on a timer. That separation
  is what makes the cache safe.

## Non-obvious conventions

- Every open/closed computation is in `Asia/Kolkata`, via `Intl` parts, never the
  runtime's local timezone. This is the #1 correctness risk in the app.
- Unknown hours are **never** shown as open — they read "Hours unverified".
- `hours_verified` is flipped by humans only. Machines propose, the owner
  disposes: the monthly refresh files an `osm_hours_drifted` report instead of
  editing a verified row.
- The category vocabulary in `lib/types.ts` is fixed and Zod-enforced. Tags
  outside it are dropped, not stored.
- OSM attribution in the footer and on the map is an ODbL legal requirement.
- Commit at each phase boundary; append a line to `DECISIONS.md` for any
  judgement call.

## Phase 4 scope, for reference (docs/05)

Email-OTP login locked to `ADMIN_EMAIL`; queue tab (approve/reject with
correction diffs); places tab (inline edit, `hours_verified` toggle that stamps
`verified_at`, bulk approve for seed batches); reports tab grouped by place.
All mutations server-side and session-checked.

Accept: a non-admin email cannot get in; approving a submission copies it into
`places` as `approved` / `source='community'`; the verify toggle stamps
`verified_at`; the service-role key stays out of the client bundle.

Phase 4 needs **no** network access to build — only to test against the real
project.
