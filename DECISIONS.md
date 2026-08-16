# DECISIONS

Append-only log of judgment calls made where the docs under-specified something.
Newest at the bottom. Format: `date — decision — why`.

## Phase 0

- **2026-08-16 — Tailwind v4 (CSS-first `@theme`) instead of a `tailwind.config.ts`.**
  docs/02 says "Tailwind CSS" and docs/05 says "design tokens in Tailwind config".
  Tailwind v4 is the current stable line and moves configuration into CSS, so the
  tokens live in `app/globals.css` under `@theme` — that *is* the config now. Same
  intent, no JS config file, smaller build. All colour/type/motion tokens are in one
  block there; components must not introduce raw hex values.

- **2026-08-16 — Next.js 15, not 16.** docs/02 pins Next.js 15 explicitly. Next 16 is
  available and would be a clean upgrade (App Router API is compatible), but the spec
  is explicit and 15 is still supported. Flagging as a known, low-effort upgrade path.

- **2026-08-16 — Type pairing: Baloo Bhaijaan 2 (display) + IBM Plex Sans (body).**
  docs/04 asks for "a characterful display face with local flavour … not Inter, not the
  default grotesk". Baloo Bhaijaan 2 comes from Ek Type / Indian Type Foundry, has the
  heavy warm signage energy of hand-painted Bombay shopfronts, and carries Devanagari
  if the wordmark ever needs it. IBM Plex Sans reads cleanly at small sizes and has
  proper tabular figures for the times. Both are free and self-hosted by `next/font` at
  build time — no external font CDN request at runtime, which keeps the ₹0 rule and the
  1-bar-of-network requirement honest.

- **2026-08-16 — Extra TS strictness beyond `strict: true`.** Added
  `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`. The open-now engine indexes into arrays of time windows
  by day key; unchecked index access is exactly the class of bug that would silently
  produce a wrong "open now". Worth the friction.

- **2026-08-16 — `npm run lint` runs `eslint .` directly, not `next lint`.**
  `next lint` is deprecated in 15.5 and removed in 16. Same rule set via
  `eslint.config.mjs` + `FlatCompat`, one less thing to migrate later.

- **2026-08-16 — Local DB connection string kept in `.env.db.local`, not `.env.local`.**
  The Postgres superuser URL is only needed by migration tooling, never by the app. Keeping
  it out of `.env.local` means it can never be read by Next.js at runtime. Both files are
  gitignored; `.env.example` lists only the five app variables docs/01 specifies.

## Phase 1

- **2026-08-16 — The week is modelled as a 10,080-minute circle, not seven independent days.**
  Every opening window becomes an interval on that circle, so an overnight window is
  just an interval that runs past a day boundary and a Sunday-night window wraps to
  Monday with no special case. Containment is tested against both `t` and `t + WEEK`.
  This is what makes "Fri 19:00–02:30 is open at Sat 01:00" and the Sunday→Monday
  wraparound fall out of the model rather than being patched in.

- **2026-08-16 — Closing time is exclusive: a place closing at 02:30 is shut at 02:30 sharp.**
  The alternative (inclusive) would show "open" to someone standing outside a closed
  shutter. Half-open intervals are also what makes adjacent windows chain cleanly.

- **2026-08-16 — Directly adjacent windows are merged into one continuous stretch.**
  A 24×7 place listed as `00:00–24:00` seven times would otherwise report "closes at
  midnight" every night. `getOpenState` returns a distinct `always_open` kind so the UI
  can say "Open 24×7" instead of inventing a closing time.

- **2026-08-16 — `open === close` in a window means 24 hours, not zero.**
  Matches the OSM `00:00-24:00` idiom. A zero-length window has no meaning anyone would
  intend, so reading it as "all day" is the only non-surprising choice.

- **2026-08-16 — Malformed hours are dropped, never guessed.** A window like
  `{"open":"25:00"}` contributes nothing, and a place whose windows all fail validation
  reads as `unknown` — i.e. "hours unverified". Bad data must never manufacture an
  "open now"; that is the one promise this product makes.

- **2026-08-16 — Area assignment is contiguous latitude bands plus explicit exceptions.**
  The 13 areas tile the corridor with no gaps (each area's northern edge is the next
  one's southern edge), so no place falls between two areas. Worli needed an explicit
  exception box: it shares a latitude with Dadar but sits on the western shore, and
  filing Worli under "Mahim–Dadar" is the kind of thing a Mumbaikar would notice
  immediately. A test pins both.

- **2026-08-16 — No PostGIS.** Distances use a plain haversine helper and the approved
  dataset is sorted in memory. At a few thousand rows this is faster than a spatial
  index and needs no extension. **Upgrade path:** if the dataset passes ~50k rows or we
  add radius queries server-side, enable PostGIS, add a `geography(Point)` column with a
  GiST index, and move sorting into SQL.

- **2026-08-16 — Scripts can talk to either Supabase or a direct Postgres URL.**
  `scripts/lib/db.ts` has two backends behind one narrow interface. Supabase
  (service-role over HTTPS) is the default and is what the GitHub Action uses; a direct
  `--url=` connection is for local development. This also unblocked development in a
  sandbox whose network policy blocks `*.supabase.co` — the whole schema and the RLS
  suite were proven against a local Postgres 16 first.

- **2026-08-16 — RLS is proven by a script, not asserted in a comment.**
  `npm run rls:test` inserts approved/pending/rejected/archived fixtures, drops to the
  `anon` role, and asserts 15 things a hostile visitor with the public anon key would
  try. It fails the build if any of them succeed.

- **2026-08-16 — Upserts use `coalesce(excluded.col, places.col)`.**
  A seeder that only knows a place's hours must not blank out the phone number the owner
  typed in. Omitted columns keep their stored value; this is the mechanism behind
  "machines propose, the owner disposes".

## Phase 2

- **2026-08-16 — OSM `opening_hours` is evaluated, not parsed.** The syntax is a small
  language (`Mo-Th 19:00-01:00; Fr-Sa 19:00-03:00; Su off`, `24/7`, `sunset-sunrise`,
  month ranges). Reimplementing it would be a bug farm, so we hand the string to the
  reference implementation, ask when the place is open across one reference week, and
  read the answer back into our own format. The reference week is built with the *local*
  Date constructor and read back with local getters, so the result is identical under any
  `TZ` — verified under UTC, America/New_York and Australia/Lord_Howe (a half-hour DST
  zone).

- **2026-08-16 — We keep OSM's rule-override semantics even though they under-state
  closing times, and flag the affected rows.** In `opening_hours` syntax a later rule
  replaces the previous day's spill past midnight, so `Mo-Th 18:00-01:00; Fr-Sa
  18:00-03:00; Su 18:00-01:00` genuinely evaluates with Thursday and Saturday closing at
  00:00. The reference implementation is right by the spec; the mapper almost certainly
  meant a later close. We keep the spec-correct answer because under-stating a closing
  time is the safe direction for a product promising "if we say open, it's open" — and
  the seed report now lists every place with a window ending at exactly midnight under
  "Verify these first", since that is the fingerprint of this truncation.

- **2026-08-16 — Seed scripts accept `--fixture`.** The full pipeline — parse, classify,
  dedupe, upsert, report — runs against a saved Overpass response with no network. That
  makes the seeder testable in CI, developable offline, and kind to a free shared service
  we would otherwise hammer during development. `data/fixtures/overpass-sample.json` ships
  as the offline sample.

- **2026-08-16 — `shop=convenience` rows keep an empty category list.** docs/03 includes
  them in the Overpass query, but the fixed category vocabulary has no term for a corner
  shop and inventing one ("fast_food") would be a lie. They land as pending with no
  categories for the owner to tag or reject.

- **2026-08-16 — Manual rows take over the matching OSM row rather than shadowing it.**
  When a CSV row matches a seeded OSM place by name within 150 m, the seeder updates
  *that* row — keeping its `osm_id` so future refreshes still diff correctly — instead of
  creating a second row that would show up twice in the list.

- **2026-08-16 — The dedupe radius is 150 m and names are compared after stripping chain
  noise.** Mumbai has genuinely distinct outlets of the same name a few hundred metres
  apart, so a tight radius plus "a duplicate the owner can archive in one tap" beats a
  loose radius that silently merges two real places.

- **2026-08-16 — The lead scraper refuses listings platforms in code, not just in docs.**
  Zomato, Swiggy, Google, TripAdvisor, Yelp, Dineout, EazyDiner and magicpin are rejected
  by hostname even if someone adds them to `data/scrape-sources.json`. robots.txt is
  fetched and obeyed per URL, requests are ≥ 5 s apart under a `BombayNights-leads/1.0`
  agent, and only name / locality / claimed timing are retained — never article prose,
  images or rankings.

- **2026-08-16 — A lead about a place we already know files a report; it never edits.**
  And if that place is owner-verified, not even a report — a blog is likelier to be stale
  than the owner. Claimed timings are hearsay until a human confirms them.

## Phase 3

- **2026-08-16 — Cache the facts, compute the judgement.** The approved dataset is
  server-cached for five minutes, but "open now" is never cached: it is recomputed in the
  browser on a 30-second timer from a server-rendered starting timestamp. That is what
  lets a page cached at 01:58 show "Closed" at 02:31 without a refresh, and it is the
  reason the five-minute cache is safe at all.

- **2026-08-16 — All list state lives in the URL.** `/places?area=bandra&tags=shisha_lounge,bar&open=all`
  is the whole view. People decide where to go in a group chat, so every filtered view has
  to be a link someone can paste.

- **2026-08-16 — Unknown hours sort above closed, below open.** A place we cannot vouch
  for is more useful than one we know is shut, but it must never outrank something we can
  confirm — and its status line says "Hours unverified", never "open".

- **2026-08-16 — Geolocation is opt-in and never leaves the browser.** No prompt on load;
  it fires only when someone taps "Near me", a refusal falls through silently to the area
  chips, and the coordinates are used locally to sort a list the browser already has.

- **2026-08-16 — Leaflet is dynamically imported, CSS included.** Most visitors never open
  the map, and the list has to work on one bar of network. `/places` first-load JS is
  128 kB against the 150 kB budget, with Leaflet outside it entirely.

- **2026-08-16 — Rate limiting stores `sha256(ip + daily-rotating salt)`, never an IP.**
  The salt rotates at IST midnight, so the hash counts today's submissions and is useless
  for following anyone across days. If the count query fails, the request is refused —
  a dropped submission is recoverable, an open write endpoint is not.

- **2026-08-16 — The honeypot returns 201, not an error.** Telling a bot it was blocked
  just teaches it to try again.

- **2026-08-16 — Timestamps are normalized in the Zod schema.** A direct `pg` connection
  returns `Date` objects where PostgREST returns ISO strings; the build caught this. The
  schema now preprocesses both into an ISO string so nothing downstream has to care which
  driver it came from.

- **2026-08-16 — "Opens 7 PM", not "Opens Sun 7 PM", when the next opening is today.**
  `getOpenState` carries a `nextIsToday` flag, because naming today's own day reads as
  "next week".

- **2026-08-16 — A direct-Postgres read driver exists behind `BN_DB_DRIVER=postgres`.**
  Production only ever talks to Supabase through RLS with the anon key. The `pg` path is
  dynamically imported so it is never bundled otherwise, and it exists because this
  sandbox's network policy blocks `*.supabase.co` — without it, none of Phase 3 could
  have been run, screenshotted or verified.

## Phase 4

- **2026-08-16 — Migrations reach Supabase over HTTPS via the Management API, not port 5432.**
  Supabase's Postgres is raw TCP on 5432 and the direct host now resolves IPv6-only;
  neither is reachable from the sandboxes this project is built in (verified: pooler
  and direct both time out). `scripts/lib/sqlRunner.ts` puts two transports behind one
  interface — direct `pg` for local work, and
  `POST /v1/projects/{ref}/database/query` with a personal access token for everything
  else — and `db:push` prefers the HTTPS one whenever `SUPABASE_ACCESS_TOKEN` is set.
  A migration and its `schema_migrations` row are sent as one multi-statement string,
  which Postgres runs as a single implicit transaction, so atomicity survives the change.
  `--fresh` against a remote project now demands `--force` as well, because dropping
  the public schema is a very different act on a laptop than on the real thing.

- **2026-08-16 — Seed slugs are allocated, not derived.** `slugify(name, area)` collides
  in the real dataset — Mumbai has a Starbucks on every other corner of Andheri and OSM
  has a node for each — and the first collision killed the whole seed run against the
  live project. `scripts/lib/slugAllocator.ts` gives an existing row back its stored slug
  (so re-runs stay idempotent) and suffixes only genuinely new places, taking the lowest
  free suffix so a repeat run allocates identically. This never showed up in Phase 2
  because the 20-row fixture had no duplicate names.

- **2026-08-16 — Admin identity is `session.email === ADMIN_EMAIL`, checked on every
  request, and never a database role.** A Supabase project will happily mint an
  `authenticated` session for any address that asks, so "logged in" proves nothing here.
  There is deliberately no admin role in Postgres: RLS hides pending places, submissions
  and reports from `anon` *and* `authenticated`, and admin reads go through the
  service-role client behind `requireAdmin()`. Proven live — a stranger holding a valid
  session for this project is redirected out and sees no data, and a forged cookie
  carrying the owner's email is refused because `getUser()` revalidates with Supabase
  rather than trusting the cookie.

- **2026-08-16 — `requireAdmin()` is called inside every admin read and every Server
  Action, not once in a layout.** A Server Action is a public HTTP endpoint; a layout
  does not run before one. Repeating the check is cheap and means a future route that
  forgets the guard cannot leak the dataset.

- **2026-08-16 — The login form answers identically for any address.** Saying "that is
  not the admin email" to a wrong address confirms which one is right, and the form is
  on the public internet. A non-admin address never reaches Supabase at all, so a
  stranger cannot even create an account against this project through it.

- **2026-08-16 — A correction is shown as a field-level diff, and a blank field means
  "no opinion".** `lib/submissionDiff.ts` reduces a correction to what actually changed,
  because moderating by re-reading two full records at 2 AM is how wrong edits get
  approved. A field the contributor left empty is never treated as "delete this" — same
  `coalesce` semantics as the seed upserts. GPS jitter under ~11 m is not reported as a
  move, since a phone reading is never bit-identical.

- **2026-08-16 — The verify toggle clears `verified_at` when switched off.** A stale
  "verified 3 months ago" stamp on a row nobody has confirmed since is worse than no
  stamp, because the badge is the one promise this product makes.

- **2026-08-16 — Bulk approve is capped at 200 ids and takes an explicit selection.**
  Clearing a seed batch is the reason the places tab exists, but "approve everything
  matching the current filter" is exactly how unverified hours reach the whole city.
  The button names the count it is about to approve.

- **2026-08-16 — `ip_hash` is never selected into the admin.** It exists to rate-limit,
  not to identify, and the moderation UI has no use for it. Leaving it out of the query
  means it cannot reach a client component by accident.

- **2026-08-16 — Timestamp display lives in `lib/istTime.ts`, apart from `format.ts`.**
  `format.ts` is deliberately timezone-free and `openNow.ts` is the open/closed engine.
  Rendering a stored timestamp is a third concern, and it must be pinned to
  `Asia/Kolkata` — the runtime zone on Vercel is UTC, which would date every
  after-midnight submission a day early. Tested under three timezones.

- **2026-08-16 — Photos are links, with a converter offered next to the field, not
  uploads.** docs/05 defers the photo pipeline out of V1 and hosting user images brings
  storage, moderation and takedown obligations with it. A bare "paste an image URL" box
  is useless to someone standing outside a place with a photo in their camera roll, so
  the field carries a one-tap link to a free image host: upload there, paste the link
  back. Nothing is uploaded to us, there is no third-party script on the page, and the
  URL is restricted to http(s) so a `javascript:` link can never reach an href in the
  admin. **Upgrade path:** a Supabase Storage bucket (1 GB free) would let people upload
  in-page with no third party — worth doing when photos matter enough to moderate.

- **2026-08-16 — Contributor name and contact are optional fields, and the form says
  plainly that filling more in helps.** Anonymous submission stays the promise, so
  neither can ever be required; the contact is for checking a detail and is never shown
  publicly. Telling people that a complete submission is more accurate and likelier to
  be featured beats marking fields required that are not.

- **2026-08-16 — `rls:test:live` probes the deployed project through PostgREST with the
  real anon key.** `rls:test` proves the policies by dropping to the `anon` role over a
  direct connection, which needs port 5432. The live variant is complementary and, for a
  deployed project, stricter: it exercises the exact surface a hostile visitor has, where
  an exposed view or a forgotten grant would show up and a SQL-level test would not.
  15/15 pass against the real project.

## Phase 4 — follow-ups found while preparing to deploy

- **2026-08-16 — The OTP field accepts 6–10 digits, not exactly 6.** Supabase's
  `mailer_otp_length` is a per-project setting that can be changed in the dashboard
  without a deploy, and this project issues **8**. The original `\d{6}` rule would have
  rejected every real login in production. The earlier end-to-end test missed it because
  it redeemed codes through Supabase's admin API, bypassing our own validation — a
  reminder that a test which skips the form does not test the form.

- **2026-08-16 — The code box opens after any send attempt, and there is an "I already
  have a code" way in regardless.** Supabase's built-in mailer allows two emails an hour.
  Showing the code box only on a *successful* send meant: ask for a code, get impatient,
  ask again, hit the limit — and now the box is hidden at the exact moment the first code
  lands in the inbox. That is a one-hour lockout from your own admin while holding a
  valid code. The rate-limit message now says what the cap is and that an existing code
  still works. Proven by signing in while actually rate-limited.
