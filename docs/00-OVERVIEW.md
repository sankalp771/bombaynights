# 00 — Overview

## The problem

At 1 AM in Mumbai, finding a place that is *actually* open is guesswork. Google
hours are stale for late-night spots, Zomato is delivery-first, and blog
listicles ("31 places open after midnight!") are static and rot within months.
Groups waste 40 minutes deciding, drive somewhere, find shutters down, and
cancel the plan.

## The product

**BombayNights** — a fast, mobile-first directory of every restaurant, eatery,
bar, café, street-food spot, and shisha lounge open **between 12:00 AM and
6:00 AM**, covering the corridor from **Mira Road–Bhayandar down to South
Bombay**.

One promise: *if it's on BombayNights and marked verified, it's really open.*

## Who uses it

- Groups deciding where to go for a night out (bar → food → shisha chains)
- Solo late workers / drivers wanting a quick bite nearby
- People willing to travel across the city for the right spot (destination
  browsing by area matters as much as "near me")

## What makes it different (the moat)

The data layer Google/Zomato don't have, hand-curated by the owner:

- Honest **closing time** (and where known, notes like "kitchen slows after 2")
- **Category tags** on every place: veg / non-veg, serves-alcohol, shisha,
  dine-in / takeaway / car-dining, 24x7, street-food, etc.
- **Verified badge** with a "last verified" date — trust is the product
- Community submissions keep coverage growing; owner approval keeps it clean

## Editorial stance

- Comprehensive over curated: a dhaba with plastic chairs matters as much as a
  five-star lounge. Cover *everything* in scope, let tags differentiate.
- Never show a place as "open now" unless stored hours say so; when hours are
  unknown, say "hours unverified" honestly rather than guessing.

## Non-goals for V1

- No delivery, no table booking, no payments
- No user accounts / profiles / reviews (only anonymous submissions + reports)
- No cities beyond the Mumbai western corridor (schema should not hard-code
  Mumbai, but build zero multi-city UI)
- No native app (the site is installable as a lightweight PWA instead)

## North-star metric

Time from opening the site to having a place chosen: **under 60 seconds.**
