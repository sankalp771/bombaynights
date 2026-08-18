-- Option A of the timings discussion (DECISIONS 2026-08-18): `hours` means
-- visit hours, full stop. A brand delivery site's window is NOT that, so the
-- chain scraper no longer writes it into `hours` — it lands here instead, an
-- admin-only breadcrumb shown beside the row while the owner verifies the real
-- dine-in close. Never selected by public queries (lib/data.ts picks columns
-- explicitly).

alter table places
  add column if not exists scrape_hint text;
