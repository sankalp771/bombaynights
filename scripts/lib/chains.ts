import { z } from 'zod';
import { parseHhMm } from '@/lib/format';

/**
 * Inlet 5 — brand chains from their own official sites (DECISIONS 2026-08-18).
 *
 * A chain's own outlet page is the authoritative source for that outlet's
 * existence and timings — unlike OSM there is a company keeping it current,
 * because it takes orders through it. We extract facts only (name, timings,
 * coordinates from the page's own schema.org microdata), never menus, prices,
 * or prose. Aggregators (Zomato/Swiggy/Google) remain forbidden.
 *
 * This module is the pure, testable part: HTML in, facts out.
 */

export interface ChainOutlet {
  name: string;
  /** "HH:MM" 24h — from the page's OpeningHoursSpecification microdata. */
  opens: string;
  closes: string;
  lat: number;
  lng: number;
}

const outletSchema = z.object({
  name: z.string().min(3).max(120),
  opens: z.string().regex(/^\d{2}:\d{2}$/),
  closes: z.string().regex(/^\d{2}:\d{2}$/),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

function microdata(html: string, prop: string): string | null {
  const match = html.match(new RegExp(`itemprop="${prop}"[^>]*content="([^"]*)"`, 'i'));
  return match?.[1] ?? null;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "09:00:00" | "09:00" → "09:00", anything else → null. */
function hhmm(value: string | null): string | null {
  const match = value?.match(/^(\d{2}:\d{2})(?::\d{2})?$/);
  return match?.[1] ?? null;
}

/**
 * Parse one outlet page (e.g. mcdelivery.co.in/restaurants/mumbai/419/…).
 * Returns null rather than guessing when any fact is missing — a page we
 * cannot read cleanly is a page we skip and report.
 */
export function parseOutletPage(html: string): ChainOutlet | null {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const name = h1?.[1] ? stripTags(h1[1]) : null;

  const parsed = outletSchema.safeParse({
    name,
    opens: hhmm(microdata(html, 'opens')),
    closes: hhmm(microdata(html, 'closes')),
    lat: Number(microdata(html, 'latitude')),
    lng: Number(microdata(html, 'longitude')),
  });

  return parsed.success ? parsed.data : null;
}

/**
 * Open past midnight? In the hours format, `close <= open` crosses midnight.
 * A close of exactly 00:00 means "till midnight sharp" — not late-night.
 */
export function closesAfterMidnight(opens: string, closes: string): boolean {
  const open = parseHhMm(opens);
  const close = parseHhMm(closes);
  if (open === null || close === null) return false;
  return close <= open && close > 0;
}

/** Restaurant URLs for the corridor from a sitemap: Mumbai + Mira-Bhayandar. */
export function corridorOutletUrls(sitemapXml: string): string[] {
  const urls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
    (match[1] ?? '').trim(),
  );
  return urls.filter(
    (url) =>
      /\/restaurants\/mumbai\//.test(url) ||
      (/\/restaurants\/thane\//.test(url) && /mira|bhayandar|bhayander|kashimira/i.test(url)),
  );
}
