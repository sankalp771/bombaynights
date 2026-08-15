# 06 — Deployment & Ops

## Supabase (Free tier)

1. Owner creates project at supabase.com — region **ap-south-1 (Mumbai)**.
2. Apply migrations via Supabase CLI (`supabase db push`) — never paste SQL by
   hand into the dashboard; migrations in git are the source of truth.
3. Auth: enable Email provider, OTP/magic-link only; disable signups is not
   available on free tier, so admin check is enforced server-side against
   `ADMIN_EMAIL` on every admin request (belt) in addition to RLS (suspenders).
4. Free-tier note: projects pause after ~1 week of inactivity. The monthly
   refresh Action doubles as a keep-alive; if pausing is ever observed, add a
   tiny weekly ping job to the same workflow file.

## Vercel (Hobby)

- Import the GitHub repo; framework auto-detected.
- Env vars: the five from docs/01 in Production + Preview.
- Custom domain optional; everything must work on `*.vercel.app`.
- `NEXT_PUBLIC_SITE_URL` drives canonical URLs/sitemap — set it to the real
  domain when one exists.

## GitHub Actions

`monthly-refresh.yml`: cron `0 22 1 * *` (03:30 IST on the 1st) + manual
`workflow_dispatch`. Needs repo secrets: `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`. Behavior rules live in docs/03. Output: markdown
report as a new GitHub issue labeled `refresh-report`.

## Operational runbook (goes into final README)

- **Add places yourself:** append to `data/manual-seed.csv`, run
  `npm run seed:manual` (or commit and run via a workflow_dispatch action).
- **Moderate:** open `/admin`, work the queue. Corrections show diffs — apply
  judgment, the reporter might be wrong.
- **Verify:** whenever you (or a trusted friend) confirm a place's real
  late-night behavior, set exact `hours`, tags, `last_call`, flip
  `hours_verified` — the ✓ badge is the brand, spend it carefully.
- **Monthly:** read the refresh issue; act only on drift reports for verified
  places.
- **If Overpass fails** (it's a shared free service): the Action retries with
  a mirror endpoint (kumi.systems); if both fail it exits gracefully and the
  issue says so — nothing user-facing depends on it.

## Costs & limits sanity table

| Service | Free limit | Our usage |
|---|---|---|
| Supabase | 500MB DB, 5GB egress | ~5k rows ≈ a few MB; cached reads keep egress tiny |
| Vercel Hobby | 100GB bandwidth | Fine for a directory site |
| Overpass | Fair-use | 13 queries/month + retries |
| GitHub Actions | 2000 min/mo | ~5 min/mo |

If the site blows up in popularity, first move: put the places JSON behind
ISR/static generation entirely (already close to that) before touching paid
tiers.
