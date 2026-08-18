-- A place no longer requires a pin (DECISIONS 2026-08-18): community
-- submissions carry only an address, and the owner verifies via the Google
-- Maps card, not coordinates. Places without a pin stay off the map and sort
-- last in "near me"; OSM/manual seeds keep supplying real coordinates.
-- The range checks remain valid: a NULL passes a CHECK constraint.

alter table places
  alter column lat drop not null,
  alter column lng drop not null;
