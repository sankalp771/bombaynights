import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { slugify } from '@/lib/format';
import { areaForPoint } from './areas';
import {
  closesAfterMidnight,
  corridorOutletUrls,
  parseOutletPage,
  type ChainOutlet,
} from './lib/chains';
import { findDuplicate } from './lib/dedupe';
import { openDb, type PlaceUpsert } from './lib/db';
import { flagValue, hasFlag } from './lib/env';

/**
 * Inlet 5 — chain outlets from the brand's own official site (DECISIONS
 * 2026-08-18). McDonald's first; add a brand by appending to BRANDS.
 *
 * Rules, same spirit as the other inlets:
 *   · polite: robots.txt honoured, identifying UA, ≥5s between page fetches
 *   · facts only: outlet name, timings, coordinates from the page's own
 *     schema.org microdata — never menus, prices, or prose
 *   · machines propose, the owner disposes: new outlets land as `pending`,
 *     hours always `hours_verified=false`, owner-verified rows are never
 *     touched, archived rows stay dead
 *   · aggregators (Zomato/Swiggy/Google) remain forbidden — brand sites only
 *
 *   npm run scrape:chains -- --dry-run --limit=3   # prove the parse, write nothing
 *   npm run scrape:chains                          # full run (~5 min: 56 pages, 5s apart)
 */

const USER_AGENT = 'BombayNights-chains/1.0 (late-night directory seeding; low volume)';
const DELAY_MS = 5000;

interface Brand {
  key: string;
  sitemapUrl: string;
  /** Fixed facts about the brand that pages do not state. */
  categories: string[];
  food_type: 'veg' | 'nonveg' | 'both' | 'unknown';
  service_modes: string[];
}

const BRANDS: Brand[] = [
  {
    key: 'mcdonalds',
    sitemapUrl: 'https://mcdelivery.co.in/sitemap.xml',
    categories: ['fast_food', 'burgers', 'late_night'],
    food_type: 'both',
    service_modes: ['dine_in', 'takeaway'],
  },
];

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${res.status} on ${url}`);
  return res.text();
}

/** Abort if robots.txt disallows the paths we crawl for any user-agent. */
async function assertRobotsAllow(sitemapUrl: string): Promise<void> {
  const origin = new URL(sitemapUrl).origin;
  let robots: string;
  try {
    robots = await fetchText(`${origin}/robots.txt`);
  } catch {
    return; // no robots.txt — nothing forbids us
  }
  const disallows = [...robots.matchAll(/^\s*Disallow:\s*(\S+)\s*$/gim)]
    .map((m) => m[1] ?? '')
    .filter(Boolean);
  const blocked = disallows.some(
    (path) => '/restaurants'.startsWith(path) || '/sitemap.xml'.startsWith(path) || path === '/',
  );
  if (blocked) {
    throw new Error(`${origin}/robots.txt disallows our paths — refusing to crawl.`);
  }
}

async function main(): Promise<void> {
  const dryRun = hasFlag('dry-run');
  const limit = flagValue('limit') ? Number(flagValue('limit')) : Infinity;

  const lines: string[] = ['# Chain scrape report', ''];
  const log = (line: string) => {
    console.log(line);
    lines.push(line);
  };

  for (const brand of BRANDS) {
    await assertRobotsAllow(brand.sitemapUrl);

    const sitemap = await fetchText(brand.sitemapUrl);
    const urls = corridorOutletUrls(sitemap).slice(0, limit);
    log(`## ${brand.key} — ${urls.length} corridor outlet page(s)`);

    const outlets: Array<{ outlet: ChainOutlet; url: string }> = [];
    const unparseable: string[] = [];
    const early: string[] = [];

    for (const [index, url] of urls.entries()) {
      if (index > 0) await sleep(DELAY_MS);
      let outlet: ChainOutlet | null = null;
      try {
        outlet = parseOutletPage(await fetchText(url));
      } catch (error) {
        log(`  ! fetch failed: ${url} — ${(error as Error).message}`);
        continue;
      }
      if (!outlet) {
        unparseable.push(url);
        continue;
      }
      if (!closesAfterMidnight(outlet.opens, outlet.closes)) {
        early.push(`${outlet.name} (${outlet.opens}–${outlet.closes})`);
        continue;
      }
      outlets.push({ outlet, url });
      console.log(`  ✓ ${outlet.name} · ${outlet.opens}–${outlet.closes}`);
    }

    log(`  open past midnight: ${outlets.length}`);
    log(`  closes before midnight (skipped): ${early.length}`);
    for (const entry of early) lines.push(`    - ${entry}`);
    log(`  unparseable (skipped): ${unparseable.length}`);
    for (const url of unparseable) lines.push(`    - ${url}`);

    if (dryRun) {
      log('  dry run — nothing written.');
      continue;
    }

    const db = openDb();
    try {
      console.log(`Writing to ${db.label}`);
      const areaRows = await db.listAreas();
      const areaIdBySlug = new Map(areaRows.map((area) => [area.slug, area.id]));
      const existing = await db.listPlaces();

      const upserts: PlaceUpsert[] = [];
      let takeovers = 0;
      let keptVerified = 0;
      let keptDead = 0;
      let outsideCorridor = 0;

      for (const { outlet } of outlets) {
        const areaDef = areaForPoint({ lat: outlet.lat, lng: outlet.lng });
        if (!areaDef) {
          outsideCorridor += 1;
          lines.push(`    - outside corridor areas: ${outlet.name}`);
          continue;
        }

        const match = findDuplicate(outlet, existing);
        // The owner outranks the machine, both ways: verified data is never
        // overwritten, and an archived (deleted) outlet is never resurrected.
        if (match?.hours_verified) {
          keptVerified += 1;
          continue;
        }
        if (match?.status === 'archived' || match?.status === 'rejected') {
          keptDead += 1;
          continue;
        }
        if (match) takeovers += 1;

        upserts.push({
          slug: match?.slug ?? slugify(outlet.name),
          name: outlet.name,
          area_id: areaIdBySlug.get(areaDef.slug) ?? null,
          address: null,
          lat: outlet.lat,
          lng: outlet.lng,
          categories: brand.categories,
          food_type: brand.food_type,
          serves_alcohol: false,
          has_shisha: false,
          service_modes: brand.service_modes,
          // `hours` means VISIT hours (owner's call, DECISIONS 2026-08-18) and
          // a delivery site's window is not that. The outlet ships with hours
          // unknown — honestly "unverified" on the site — and the window
          // becomes an admin-only hint beside the row for verification.
          hours: null,
          scrape_hint: `${brand.key} delivery window ${outlet.opens}–${outlet.closes} — dine-in usually closes earlier; verify via the Google link`,
          hours_verified: false,
          // A takeover keeps its earned status; a new outlet awaits approval.
          status: match?.status === 'approved' ? 'approved' : 'pending',
          source: 'scraped',
        });
      }

      const written = await db.upsertPlaces(upserts, 'slug');
      log(`  upserted: ${written} (${takeovers} took over an existing row)`);
      if (keptVerified > 0) log(`  left alone (owner-verified): ${keptVerified}`);
      if (keptDead > 0) log(`  left alone (archived/rejected): ${keptDead}`);
      if (outsideCorridor > 0) log(`  outside corridor areas (skipped): ${outsideCorridor}`);
    } finally {
      await db.close();
    }
  }

  const outDir = resolve(process.cwd(), 'scripts/output');
  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, 'chains-report.md'), lines.join('\n') + '\n', 'utf8');
  console.log('\nReport: scripts/output/chains-report.md');
}

main().catch((error: unknown) => {
  console.error(`\nscrape:chains failed — ${(error as Error).message}`);
  process.exitCode = 1;
});
