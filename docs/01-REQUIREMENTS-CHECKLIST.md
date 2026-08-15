# 01 — Requirements Checklist (owner-provided)

Claude Code: verify each item before the phase that needs it. If missing, ask.

## Needed before Phase 0 (setup)

| # | Item | Notes |
|---|------|-------|
| 1 | GitHub repo | This repo; Claude Code works inside it |
| 2 | Node.js 20+ locally / in environment | For Next.js + scripts |

## Needed before Phase 1 (database) — can develop locally first

| # | Item | Notes |
|---|------|-------|
| 3 | Supabase account + new project (Free tier) | Owner creates at supabase.com; region: `ap-south-1` (Mumbai) |
| 4 | `NEXT_PUBLIC_SUPABASE_URL` | From Supabase project settings |
| 5 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (RLS makes this safe) |
| 6 | `SUPABASE_SERVICE_ROLE_KEY` | Server-only; used by seed scripts + admin API routes. NEVER exposed client-side |
| 7 | Admin email address | The ONLY email allowed to log into `/admin` (email OTP) |

## Needed before Phase 4 (deploy)

| # | Item | Notes |
|---|------|-------|
| 8 | Vercel account (Hobby, free) | Connect to this GitHub repo |
| 9 | (Optional) custom domain | e.g. `bombaynights.in`; site must work fine on `*.vercel.app` without it |
| 10 | GitHub Actions enabled on repo | For the monthly refresh cron (free) |

## Explicitly NOT needed (do not ask for these)

- ❌ Google Cloud account / billing card / Places API key — **we use
  OpenStreetMap + manual seeding instead** (see docs/03)
- ❌ Google Maps JS key — maps are Leaflet + OSM raster tiles (free)
- ❌ Any paid service of any kind

## Owner's ongoing responsibilities after launch (document in README)

1. Review the pending-submissions queue in `/admin` (few minutes, whenever)
2. Verify/adjust hours + tags on seeded places, flipping them to **verified**
3. Fill the manual seed CSV with known late-night spots OSM misses
   (galli joints, car-dining spots, new lounges)
4. Glance at the monthly refresh PR/report produced by the GitHub Action

## Environment variable summary (`.env.example` must contain exactly these)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_EMAIL=
NEXT_PUBLIC_SITE_URL=
```
