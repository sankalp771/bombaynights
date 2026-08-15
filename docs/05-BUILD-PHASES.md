# 05 — Build Phases

Build strictly in order. Each phase ends with: all acceptance criteria pass,
code committed, one line appended to `DECISIONS.md` if any judgment call was
made. Phases 0–2 can run fully locally (local Supabase via CLI or a dev
project) if cloud credentials aren't provided yet.

## Phase 0 — Skeleton
Next.js 15 + TS strict + Tailwind + ESLint/Prettier + Vitest. Folder layout:
`app/`, `lib/`, `components/`, `scripts/`, `supabase/migrations/`, `data/`,
`docs/`. `.env.example` per docs/01. Design tokens in Tailwind config per
docs/04. Placeholder landing renders.

**Accept:** `npm run dev` serves; `npm run lint`, `typecheck`, `test` all green.

## Phase 1 — Schema + open-now engine (the brain)
Migrations for all tables/enums/indexes/RLS per docs/02. `lib/openNow.ts`
pure + fully tested (every case listed in docs/02, esp. overnight spill and
IST-regardless-of-runtime-TZ). Haversine helper + tests. `scripts/areas.ts`
with the 13 corridor areas + bboxes; areas table seeded.

**Accept:** migrations apply cleanly to a fresh DB; anon role provably cannot
read pending rows or write anything (write a small RLS test script);
`openNow` tests pass including with `TZ=UTC` and `TZ=America/New_York` set.

## Phase 2 — Seeding
`seed-osm.ts` (Overpass → parse → classify → upsert + per-area report),
`seed-manual.ts` (CSV → upsert), `scrape-leads.ts` (listicle lead discovery
per docs/03 Inlet 4, with `data/scrape-sources.json`), starter
`data/manual-seed.csv` with example rows, dedupe rule (manual beats OSM within
150m same-name), `--dry-run` flag on all three.

**Accept:** dry-run prints a sane report; live run against dev DB inserts
plausible counts; re-running is idempotent (no dupes); a place with hours
`19:00–02:30` shows open at simulated 01:00 IST.

## Phase 3 — Public site
Landing, `/places` list (URL-driven filters, sort, cards, empty states),
Leaflet map view (lazy), `/place/[slug]`, `/area/[slug]`, `/submit` (+ API
route with Zod, honeypot, ip-hash rate limit), report-wrong-timing flow,
`/about`, PWA manifest, sitemap/meta/OG tags, OSM attribution in footer + map.

**Accept:** on a 390px viewport every flow works one-handed; card status lines
correct against seeded data at 3 simulated times (23:00, 01:30, 05:50 IST);
submit → row in `submissions` and 6th same-day submit from one ip_hash is
rejected; geolocation denial falls back gracefully; Lighthouse mobile ≥ 90 on
`/places`; first-load JS < 150KB on list page.

## Phase 4 — Admin
Email-OTP login locked to `ADMIN_EMAIL`; queue (approve/reject, correction
diffs), places editor (inline edit, verify toggle, bulk approve), reports tab.
All admin mutations server-side, session-checked.

**Accept:** non-admin email cannot obtain access; approve moves a submission
into `places` as `approved`/`source='community'`; verify toggle stamps
`verified_at`; service-role key absent from client bundle (`grep` the build).

## Phase 5 — Deploy + ops
Vercel deploy (envs set), Supabase prod project + migrations, production seed
run, monthly-refresh GitHub Action (docs/03 rules; summary → GitHub issue),
final `README.md` (setup, seeding, moderation workflow, refresh, tag
vocabulary), quick Plausible-style analytics ONLY if a free tier fits — else
skip, note in DECISIONS.md.

**Accept:** production URL live end-to-end (browse → detail → directions link;
submit → appears in prod admin queue → approve → visible publicly);
workflow-dispatch run of the refresh Action succeeds and files its report.

## Deferred (backlog, do not build in V1)
Photos pipeline, WhatsApp share cards, "chalu hai kya?" live crowd check-ins,
open-later-tonight notifications, Thane/Navi Mumbai/Central line expansion,
multi-city, English↔Hinglish toggle.
