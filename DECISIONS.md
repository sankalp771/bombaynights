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
