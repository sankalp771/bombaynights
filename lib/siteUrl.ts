/**
 * Where the site thinks it lives.
 *
 * This one string drives `metadataBase`, every canonical/OG tag, `robots.txt`
 * and all 27+ entries in `sitemap.xml`. Getting it wrong is silent: the pages
 * still render, but everything a crawler is told to fetch points at a host that
 * does not exist.
 *
 * That is not hypothetical — production shipped for a while with
 * `NEXT_PUBLIC_SITE_URL=https://CHANGE-ME.vercel.app`, so the entire sitemap
 * advertised a dead domain. Hence the placeholder rejection below: an obviously
 * unfilled template value is treated as *unset*, not as truth, and we fall
 * through to the domain Vercel itself reports. The deploy heals rather than
 * quietly publishing garbage.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL          — explicit, wins when it looks real
 *   2. VERCEL_PROJECT_PRODUCTION_URL — the stable production domain on Vercel
 *   3. VERCEL_URL                    — this specific deployment (previews)
 *   4. http://localhost:3000         — local dev
 */

/**
 * Hosts that are plainly a template someone forgot to fill in. Matched against
 * the hostname only, so a legitimate path or query can never trip it.
 */
const PLACEHOLDER_HOSTS = [
  'change-me',
  'changeme',
  'your-domain',
  'yourdomain',
  'example.com',
  'example.org',
  'todo',
];

function isPlaceholderHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return PLACEHOLDER_HOSTS.some((needle) => host.includes(needle));
}

/**
 * Parse a candidate into an origin, or return null if it is unusable.
 * Bare hosts (`bombaynights.vercel.app`) are accepted and assumed https —
 * that is the shape Vercel's own env vars take.
 */
function normalize(candidate: string | undefined): string | null {
  const raw = candidate?.trim();
  if (!raw) return null;

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }

  if (!parsed.hostname || isPlaceholderHost(parsed.hostname)) return null;

  // Origin only — no trailing slash, no path, so callers can append freely.
  return parsed.origin;
}

/**
 * Resolve from an explicit environment bag. Exported for tests; app code should
 * use `siteUrl` / `getSiteUrl()` below.
 */
export function resolveSiteUrl(env: Record<string, string | undefined>): string {
  return (
    normalize(env['NEXT_PUBLIC_SITE_URL']) ??
    normalize(env['NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL']) ??
    normalize(env['VERCEL_PROJECT_PRODUCTION_URL']) ??
    normalize(env['NEXT_PUBLIC_VERCEL_URL']) ??
    normalize(env['VERCEL_URL']) ??
    'http://localhost:3000'
  );
}

export function getSiteUrl(): string {
  /*
   * Read each variable as a full static expression rather than indexing
   * `process.env` dynamically: Next.js inlines `NEXT_PUBLIC_*` at build time
   * only when it can see the literal property access in the source.
   */
  return resolveSiteUrl({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL:
      process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    NEXT_PUBLIC_VERCEL_URL: process.env.NEXT_PUBLIC_VERCEL_URL,
    VERCEL_URL: process.env.VERCEL_URL,
  });
}

/** The resolved origin, without a trailing slash. */
export const siteUrl = getSiteUrl();
