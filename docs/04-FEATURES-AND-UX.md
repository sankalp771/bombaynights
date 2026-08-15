# 04 — Features & UX

The user is on a phone, outside, at 1 AM, deciding with friends. Every screen
answers one question: **"where can we go right now?"** Time-to-decision < 60s.

## Pages

### `/` — Landing = the answer, not a brochure
- Top: live line — "**{N} places open right now** · {time} IST"
- Two entry actions, equal weight (users split between nearby & destination):
  1. **"Near me"** — browser geolocation → list sorted by distance
  2. **Area chips**, north → south: Mira Road–Bhayandar … Fort–Colaba
- Below the fold: "Closing latest tonight" strip (top 6 by `closesAt`), and a
  compact tag cloud (biryani, shisha, bar, chai…) linking to filtered lists.
- Geolocation denied/unavailable → silently fall back to area chips. Never block.

### `/places` — The list (core screen)
- URL-driven state (shareable): `/places?area=bandra&tags=shisha,bar&open=now`
- Default scope: `open=now`. One tap toggles "open now" ↔ "all late-night".
- Tag bar: horizontally scrollable chips; tap to AND-combine; active chips
  visually distinct; one-tap clear.
- Sort: open-now → closes-latest → distance (when located) → name.
- **Place card:** name · area · distance (if located) · status line
  ("Open · closes 3:30 AM" / amber "Closing soon · 2:10 AM" / "Opens 7 PM") ·
  tag chips (max 5, veg/non-veg indicator always first as the standard
  green/red square) · owner's `notes` one-liner if present · **Verified ✓ badge**
  when `hours_verified` (tooltip: "Timings confirmed {date}").
- List/Map toggle. Map = Leaflet, lazy-loaded, markers colored by open state,
  tap → mini card → detail. OSM attribution on-map (legal requirement).
- Empty state is a redirect, not a dead end: "Nothing matches in {area} — 
  {M} places open in {nearest area with results} →" plus "Know a spot? Add it."

### `/place/[slug]` — Detail
- Name, area, address, phone (`tel:` link), full week hours table with today
  highlighted, all tags, price band (₹–₹₹₹₹), notes, verified badge + date.
- **"Get directions"** → `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}`
  (a plain link — free, no SDK, opens their maps app).
- Buttons: "Report wrong timing" (one-tap reasons → `reports`) and
  "Suggest an edit" (prefilled submit form, `kind='correction'`).

### `/submit` — Community submission (anonymous)
- Required: name, area (dropdown), pin on mini-map OR address text, at least
  one category, open/close time for at least one day ("same every day" shortcut).
- Optional: everything else (food type, alcohol, shisha, phone, notes).
- Honeypot field + server rate limit (docs/02). On success: "Thanks — goes
  live after review." No login, no email asked.

### `/admin` — Owner's cockpit (email-OTP, ADMIN_EMAIL only)
- **Queue tab:** pending submissions & seeded-pending places; card shows payload
  → one-tap Approve / Reject (optional note); corrections show a field-level
  diff against the current place.
- **Places tab:** search + inline edit of any field; toggles for
  `hours_verified` (sets `verified_at=now()`) and status; bulk-approve
  checkbox flow for seed batches.
- **Reports tab:** grouped by place, resolve/dismiss.
- Boring, dense, desktop-fine. Function over form here.

### Also
- `/area/[slug]` — SSR area pages ("Late-night food in Bandra") for SEO; same
  list component, prewritten one-line area intro. Sitemap + per-page meta.
- `/about` — what BombayNights is, how verification works, OSM credit.
- PWA-lite: manifest + icons so it installs to home screen; no offline logic V1.

## Design direction (for the UI build)

**This is a night product. Dark theme is the only theme.** Design tokens up
front in Tailwind config; derive everything from them.

- **Mood:** Mumbai street at 1 AM — sodium-vapor streetlights, neon signage,
  tube-light dhabas. Warm light against deep night, not techy cyber-blue and
  not the generic near-black + acid-green AI default.
- **Palette (~5 tokens):** deep warm near-black base (blue-black like night
  sky over the sea link), warm amber/sodium primary accent (streetlight), a
  secondary neon (pink/magenta of bar signage) used *sparingly*, warm off-white
  text, and a muted green reserved exclusively for "open now".
- **Type:** a characterful display face with local flavor for the wordmark +
  headings (something with warmth/retro-signage energy — not Inter, not the
  default grotesk), a clean readable body face, `tabular-nums` for all times.
- **Signature element (spend the boldness here, once):** the status line on
  every card treated like a small neon sign — "OPEN till 3:30 AM" with a subtle
  glow, amber when closing soon, dark when closed. It IS the product promise,
  make it the visual identity. Everything else stays quiet and disciplined.
- Big touch targets, high contrast (drunk-thumb + AMOLED test), visible focus
  states, `prefers-reduced-motion` respected, no scroll-jack, minimal motion —
  at most a gentle flicker-on for the neon status on page load.
- Copy voice: plain, direct, a little Bombay. "Open now near you." "Closes
  3:30 AM." "Know a spot we missed?" Never corporate, never emoji-soup.
