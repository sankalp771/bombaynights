# HANDOFF — read this first

State of the BombayNights build as of **2026-08-16**, for whoever (or whatever)
picks it up next. Read `CLAUDE.md` and `docs/` for the spec; read `DECISIONS.md`
for why things are the way they are. This file is just: where we got to, what is
proven, and what to do next.

Branch: **`claude/phase-4-database-setup-nxzahd`**.

---

## Where the build is

| Phase | Status | Notes |
|---|---|---|
| 0 — Skeleton | ✅ done | Next.js 15, TS strict, Tailwind v4, ESLint/Prettier/Vitest |
| 1 — Schema + open-now engine | ✅ done | Migrations + RLS + `lib/openNow.ts` |
| 2 — Seeding | ✅ done | OSM / manual CSV / listicle leads, all with `--dry-run` and `--fixture` |
| 3 — Public site | ✅ done | Landing, list, detail, area, submit, about, map, PWA, sitemap |
| 4 — Admin | ✅ done | Email-OTP login, queue, places editor, reports tab |
| 5 — Deploy + ops | ⬜ **next** | Vercel, monthly-refresh Action, final README |

174 tests green. `typecheck` and `lint` clean. `/places` first-load JS is 128 kB
against the 150 kB budget.

**The old blocker is gone: the real Supabase project is live, migrated and
seeded.** Phases 0–3 were built against a local Postgres because the sandbox
blocked `*.supabase.co`; everything below is now verified against the real thing.

## The real project

`dronsbinrjjhbkiqrmfv` · region ap-south-1 · Postgres 17.6.

- Both migrations applied, tracked in `schema_migrations`.
- 13 areas seeded.
- **143 places** — 133 `pending` from OSM, 10 `approved` from `data/manual-seed.csv`.
  143 distinct slugs; re-running either seeder inserts nothing.
- The 133 OSM rows are pending **on purpose**. The public site shows the 10
  manual ones until you approve the rest in `/admin/places`.
- Admin user exists for `sankalpiit15@gmail.com`.

## What is actually verified against the real project

- **15/15 live RLS checks** (`npm run rls:test:live`) — through PostgREST with the
  real public anon key, which is the exact surface an attacker has. Anon cannot
  read pending/rejected/archived places, cannot count around the policy, cannot
  write anything, cannot touch `submissions` or `reports`.
- **Admin auth, 10/10** — the owner gets in; a stranger holding a *valid Supabase
  session for this project* is redirected out and sees no data; a forged cookie
  carrying the owner's email is refused (`getUser()` revalidates with Supabase
  rather than trusting the cookie).
- **Phase 4 acceptance, 15/15, driven through the real UI in a real browser at
  390 px** — anonymous submit → appears in the queue → approve → row in `places`
  as `approved`/`source='community'` → readable with the public anon key. The
  verify toggle stamps `verified_at`, and clears it when switched off.
- Service-role key, PAT, DB password and `ADMIN_EMAIL` are all absent from
  `.next/static`.
- No horizontal overflow at 390 px on any admin page or `/submit`.

## Credentials

`.env.local` and `.env.db.local` are gitignored and **do not exist in a fresh
clone**. See `.env.example` for every variable and what it is for.

⚠️ **Rotation is outstanding.** The service-role key, the database password and
the Supabase personal access token have all been pasted into chat transcripts.
Rotate all three in the Supabase dashboard before this goes anywhere public.

## Applying migrations from anywhere

`npm run db:push` now works over **HTTPS** when `SUPABASE_ACCESS_TOKEN` is set —
it uses Supabase's Management API instead of a Postgres connection. This matters
because Supabase's database is raw TCP on port 5432, the direct host resolves
IPv6-only, and neither is reachable from a Claude Code sandbox or most CI
runners. Verified: pooler and direct both time out here; the HTTPS path works.

```bash
npm run db:push -- --status     # what is applied, change nothing
npm run db:push -- --dry-run    # what would run
npm run db:push                 # apply
```

A direct `--url=postgres://…` still wins when given, which is how you work
against a local database. `--fresh` against the real project additionally
demands `--force`, because it drops the public schema.

## First moves in a new session

```bash
npm ci
npm run db:push -- --status      # confirm schema state
npm test && npm run typecheck && npm run lint
npm run rls:test:live            # prove the security model still holds
```

Then Phase 5 (docs/05): Vercel deploy with envs set, the monthly-refresh GitHub
Action, and the final README.

## Developing without network access

Everything still runs offline, which is how phases 0–3 were built:

```bash
scripts/local-db.sh start                     # local Postgres on :54329
npm run db:push -- --url=$(scripts/local-db.sh url) --local --fresh
npm run seed:areas -- --url=$(scripts/local-db.sh url)
npm run seed:osm -- --fixture=data/fixtures/overpass-sample.json --url=$(scripts/local-db.sh url)
npm run seed:manual -- --url=$(scripts/local-db.sh url)
npm run rls:test -- --url=$(scripts/local-db.sh url)
```

To run the site against that local DB, put this in `.env.development.local`:

```
BN_DB_DRIVER=postgres
SUPABASE_DB_URL=postgresql://postgres@127.0.0.1:54329/postgres
```

## Things that will bite you

- **Do not put `SUPABASE_DB_URL` in `.env.db.local` in a sandbox.** The seed
  scripts prefer a direct URL when they see one and will fail on it, because
  5432 is blocked. Leave it unset and they use Supabase over HTTPS.
- **Overpass rate-limits mid-run.** A full `seed:osm` takes 15–30 minutes and
  will drop one or two areas with "Overpass is unavailable". That is expected —
  re-run the missed area alone (`-- --area=byculla-mumbai-central`). Seeding is
  idempotent, so re-running costs nothing.
- **`next build` overwrites `.next` under a running `next dev`.** Kill the dev
  server before building, or it 500s afterwards.
- **`pg` returns `Date` objects where PostgREST returns ISO strings.** Handled by
  a `z.preprocess` in `lib/types.ts`; keep new timestamp columns going through it.
- **OSM rule-override semantics genuinely truncate closing times** at rule
  boundaries. We keep the spec-correct reading because under-stating is the safe
  direction, and the seed report lists every affected row under "Verify these
  first". Do not "fix" this without reading the entry in `DECISIONS.md`.
- **Do not cache "open now".** The dataset is cached for five minutes; the
  open/closed judgement is recomputed in the browser on a timer.

## Non-obvious conventions

- Every open/closed computation is in `Asia/Kolkata`, via `Intl` parts, never the
  runtime's local timezone. This is the #1 correctness risk in the app. Timestamp
  *display* is the same rule, in `lib/istTime.ts`.
- Unknown hours are **never** shown as open — they read "Hours unverified".
- `hours_verified` is flipped by humans only. Machines propose, the owner
  disposes: the monthly refresh files an `osm_hours_drifted` report instead of
  editing a verified row.
- Admin access is `session.email === ADMIN_EMAIL`, re-checked inside **every**
  admin read and **every** Server Action — not once in a layout, because a
  Server Action is a public endpoint that no layout runs before.
- The category vocabulary in `lib/types.ts` is fixed and Zod-enforced.
- OSM attribution in the footer and on the map is an ODbL legal requirement.
- Commit at each phase boundary; append a line to `DECISIONS.md` for any
  judgement call.

## Phase 5 scope, for reference (docs/05)

Vercel deploy with envs set, production seed run, monthly-refresh GitHub Action
(docs/03 rules; summary → GitHub issue), final `README.md`. Analytics only if a
free tier fits, else skip and note it.

Accept: production URL live end-to-end (browse → detail → directions link;
submit → appears in prod admin queue → approve → visible publicly);
workflow-dispatch run of the refresh Action succeeds and files its report.

Note for the Action: it will need `SUPABASE_ACCESS_TOKEN` as a repository secret
if it ever runs migrations — GitHub runners cannot reach port 5432 either.
