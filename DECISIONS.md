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
