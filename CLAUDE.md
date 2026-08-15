# BombayNights — Build Instructions for Claude Code

You are building **BombayNights**: a website to find every restaurant, eatery, bar, and
shisha lounge open between **12 AM and 6 AM** in Mumbai (Mira Road → SoBo corridor).
The owner (Sankalp) curates the data; the community submits additions anonymously.

## How to use this repo

Read the docs in this order before writing any code:

1. `docs/00-OVERVIEW.md` — what this is, who it's for, what makes it different
2. `docs/01-REQUIREMENTS-CHECKLIST.md` — things the owner must provide; STOP and ask if missing
3. `docs/02-ARCHITECTURE.md` — stack, database schema, open-now logic
4. `docs/03-DATA-AND-SEEDING.md` — OSM seeding, manual CSV, monthly refresh
5. `docs/04-FEATURES-AND-UX.md` — every feature, page, and the design direction
6. `docs/05-BUILD-PHASES.md` — the phase plan; build in this exact order
7. `docs/06-DEPLOYMENT-AND-OPS.md` — Supabase/Vercel setup, env vars, cron

## Hard rules

- **Build phase by phase** (docs/05). Do not start a phase before the previous
  phase's acceptance criteria all pass. Commit at each phase boundary.
- **₹0 infrastructure.** Free tiers only: Vercel Hobby, Supabase Free, OSM/Overpass,
  Leaflet + OSM tiles, GitHub Actions. Never add a paid API, never add Google Maps
  JS SDK or Places API (no billing account exists).
- **Time zone is always `Asia/Kolkata`** for every open/closed computation,
  regardless of server or visitor locale. This is non-negotiable and the #1
  correctness risk in this app (overnight hours like 19:00–02:30 cross midnight).
- **Secrets** live in `.env.local` (gitignored) and Vercel/GitHub environment
  settings. Never commit keys. Ship a `.env.example` with every variable named.
- **No login for visitors.** Anonymous browsing and anonymous submissions.
  Supabase Auth (email OTP) exists ONLY for the single admin.
- All writes from the public site go through server-side API routes with
  validation + rate limiting. The anon Supabase key must only be able to read
  `approved` places (enforce with RLS, not just app code).
- **OSM attribution is a legal requirement** (ODbL): "© OpenStreetMap contributors"
  must appear on the map and in the footer.
- Mobile-first. The primary user is on a phone, outdoors, at 1 AM, possibly with
  one bar of network. Test every page at 390px width. Keep JS bundles small.
- TypeScript strict mode. No `any`. Zod-validate every external input
  (Overpass responses, form submissions, query params).

## Working style

- When a doc under-specifies something, make the boring, robust choice and note
  it in `DECISIONS.md` (create it at repo root, append-only log).
- When a REQUIREMENTS item is missing (e.g., Supabase URL), pause and ask the
  owner rather than mocking around it — except where docs/05 explicitly says
  local-first is fine.
- Write a short `README.md` for the finished app in Phase 5 (setup, seeding,
  moderation workflow, monthly refresh) — assume the owner is a strong developer
  but write it so future contributors can onboard fast.
