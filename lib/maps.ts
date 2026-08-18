/**
 * Links out to Google Maps — the entire "integration".
 *
 * A name-or-address query through the official Maps URL scheme (no API, no
 * key, ToS-fine) resolves to the business card: Google's live hours, photos,
 * "Permanently closed" banner. That card is how places get verified here —
 * a human looks at it. Earlier iterations tried harder (Nominatim geocoding,
 * coordinate paste boxes) and were removed as misleading or pointless; see
 * DECISIONS.md 2026-08-18. Machines never guess locations.
 */
export function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
