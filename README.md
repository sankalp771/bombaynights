# BombayNights — Spec Repo

Find everything open in Mumbai between **12 AM and 6 AM** — restaurants, bars,
street food, shisha lounges. Mira Road → SoBo. Verified timings, community
submissions, owner-curated.

This repo currently contains only the **build specification**. The app gets
built from it by Claude Code.

## Contents

- `CLAUDE.md` — instructions + hard rules for the build agent (entry point)
- `docs/00-OVERVIEW.md` — product vision and scope
- `docs/01-REQUIREMENTS-CHECKLIST.md` — accounts/keys the owner provides
- `docs/02-ARCHITECTURE.md` — stack, schema, open-now engine, security
- `docs/03-DATA-AND-SEEDING.md` — OSM seeding, manual CSV, monthly refresh
- `docs/04-FEATURES-AND-UX.md` — pages, flows, design direction
- `docs/05-BUILD-PHASES.md` — phased plan with acceptance criteria
- `docs/06-DEPLOYMENT-AND-OPS.md` — Supabase/Vercel/Actions + runbook

## Kicking off the build

1. Complete the **"Needed before Phase 0/1"** items in
   `docs/01-REQUIREMENTS-CHECKLIST.md` (Supabase project takes ~3 minutes).
2. Open this repo in Claude Code and say:

   > Read CLAUDE.md and all docs in docs/ in order. Then build Phase 0 from
   > docs/05-BUILD-PHASES.md. Show me the acceptance criteria passing before
   > moving to Phase 1. Continue phase by phase, committing at each boundary.

3. Review each phase's commit; the design direction check matters most at
   Phase 3 (docs/04 § Design direction).

## Stack (all free)

Next.js 15 · Tailwind · Supabase Postgres (ap-south-1) · Leaflet + OpenStreetMap
· Vercel Hobby · GitHub Actions. ₹0/month by design — see the limits table in
docs/06.
