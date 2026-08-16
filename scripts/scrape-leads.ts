import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { areaBySlug, AREAS } from './areas';
import { findDuplicate, normalizeName } from './lib/dedupe';
import { extractLeads, isAllowedByRobots, type Lead } from './lib/leadExtract';
import { openDb, type ReportInsert, type SubmissionInsert } from './lib/db';
import { flagValue, hasFlag } from './lib/env';
import type { Place } from '@/lib/types';

/**
 * Inlet 4 — listicle lead discovery (docs/03).
 *
 * **This produces leads, never published data.** Mumbai's late-night blog
 * roundups are human curation that OSM simply does not have, and they are a
 * good way to find the galli joint nobody has mapped. But a blog's claimed
 * timing is hearsay: everything found here lands in the pending `submissions`
 * queue with its source URL, for the owner to verify.
 *
 *   npm run scrape:leads -- --dry-run
 *   npm run scrape:leads
 *   npm run scrape:leads -- --fixture=path/to/page.html --source-url=https://…
 *
 * Rules that are not negotiable and are enforced below, not just documented:
 *   · robots.txt is fetched and obeyed per URL
 *   · ≥ 5 s between requests, identified as BombayNights-leads/1.0
 *   · listings platforms are refused outright regardless of what the config says
 *   · only name / locality / claimed timing are kept — never article prose
 */

const USER_AGENT = 'BombayNights-leads/1.0 (https://github.com/sankalp771/bombaynights)';
const MIN_INTERVAL_MS = 5_000;
const OUTPUT_DIR = resolve(process.cwd(), 'scripts/output');

/** Hosts whose terms prohibit this. Refused even if someone adds them to the config. */
const FORBIDDEN_HOSTS = [
  'zomato.com',
  'swiggy.com',
  'google.com',
  'google.co.in',
  'maps.google.com',
  'tripadvisor.com',
  'tripadvisor.in',
  'yelp.com',
  'dineout.co.in',
  'eazydiner.com',
  'magicpin.in',
];

const configSchema = z.object({
  sources: z.array(
    z.object({
      url: z.string().url(),
      note: z.string().optional(),
    }),
  ),
});

function isForbidden(url: URL): boolean {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  return FORBIDDEN_HOSTS.some((banned) => host === banned || host.endsWith(`.${banned}`));
}

let lastRequestAt = 0;

async function politeFetch(url: string): Promise<string> {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((done) => setTimeout(done, wait));
  lastRequestAt = Date.now();

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    signal: AbortSignal.timeout(30_000),
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function robotsAllows(target: URL): Promise<boolean> {
  try {
    const robots = await politeFetch(`${target.origin}/robots.txt`);
    return isAllowedByRobots(robots, target.pathname, USER_AGENT);
  } catch {
    // No reachable robots.txt means no stated restriction. Anything else we
    // could not read, we do not guess about.
    return true;
  }
}

/** Guess an area from the locality string the article used. */
function areaFromLocality(locality: string | null): string | null {
  if (!locality) return null;
  const needle = normalizeName(locality);
  if (!needle) return null;

  for (const area of AREAS) {
    const parts = area.name.split(/[–-]/).map((part) => normalizeName(part));
    if (
      parts.some(
        (part) => part && (part === needle || needle.includes(part) || part.includes(needle)),
      )
    ) {
      return area.slug;
    }
  }
  return null;
}

interface LeadRecord extends Lead {
  sourceUrl: string;
  areaSlug: string | null;
}

async function main(): Promise<void> {
  const dryRun = hasFlag('dry-run');
  const fixture = flagValue('fixture');
  const fixtureUrl = flagValue('source-url') ?? 'https://example.invalid/fixture';

  const sources: Array<{ url: string; note?: string }> = fixture
    ? [{ url: fixtureUrl }]
    : configSchema.parse(
        JSON.parse(await readFile(resolve(process.cwd(), 'data/scrape-sources.json'), 'utf8')),
      ).sources;

  const collected: LeadRecord[] = [];
  const skippedSources: string[] = [];
  const rejectedHeadings: string[] = [];

  for (const source of sources) {
    let url: URL;
    try {
      url = new URL(source.url);
    } catch {
      skippedSources.push(`${source.url} — not a valid URL`);
      continue;
    }

    if (isForbidden(url)) {
      skippedSources.push(`${source.url} — listings platform, refused by policy`);
      console.error(`  ✗ ${url.hostname}: listings platform, refused by policy`);
      continue;
    }

    let html: string;
    if (fixture) {
      html = await readFile(resolve(process.cwd(), fixture), 'utf8');
    } else {
      if (!(await robotsAllows(url))) {
        skippedSources.push(`${source.url} — disallowed by robots.txt`);
        console.error(`  ✗ ${url.hostname}: disallowed by robots.txt`);
        continue;
      }
      try {
        html = await politeFetch(source.url);
      } catch (error) {
        skippedSources.push(`${source.url} — ${(error as Error).message}`);
        console.error(`  ✗ ${url.hostname}: ${(error as Error).message}`);
        continue;
      }
    }

    const extraction = extractLeads(html);
    rejectedHeadings.push(...extraction.rejectedHeadings);
    for (const lead of extraction.leads) {
      collected.push({ ...lead, sourceUrl: source.url, areaSlug: areaFromLocality(lead.locality) });
    }
    console.log(`  · ${url.hostname}: ${extraction.leads.length} lead(s)`);
  }

  console.log(`\n${collected.length} lead(s) extracted from ${sources.length} source(s).`);

  if (dryRun) {
    for (const lead of collected) {
      console.log(
        `  ${lead.name.padEnd(34)} ${(lead.areaSlug ?? lead.locality ?? '—').padEnd(24)} ` +
          `${lead.claimedTiming ?? 'no timing claimed'}`,
      );
    }
    await writeLeadReport(collected, skippedSources, rejectedHeadings, true);
    console.log('\nDry run — nothing was written.');
    return;
  }

  const db = openDb();
  try {
    const existing = await db.listPlaces();
    const submissions: SubmissionInsert[] = [];
    const reports: ReportInsert[] = [];
    let alreadyKnown = 0;

    for (const lead of collected) {
      const area = lead.areaSlug ? areaBySlug(lead.areaSlug) : undefined;
      const match = matchExisting(lead, existing, area?.center);

      if (match) {
        alreadyKnown += 1;
        // A conflicting claim about an unverified place is worth the owner's
        // attention. A verified place is left alone — the blog is likelier to be
        // stale than the owner.
        if (lead.claimedTiming && !match.hours_verified) {
          reports.push({
            place_id: match.id,
            reason: 'wrong_hours',
            detail:
              `A listicle claims "${lead.claimedTiming}" for ${lead.name}. ` +
              `Source: ${lead.sourceUrl}. Unverified claim — confirm before changing anything.`,
            ip_hash: 'system:lead-scraper',
          });
        }
        continue;
      }

      submissions.push({
        kind: 'new_place',
        ip_hash: 'system:lead-scraper',
        payload: {
          name: lead.name,
          area_slug: lead.areaSlug,
          locality_hint: lead.locality,
          claimed_timing: lead.claimedTiming,
          source_hint: 'scraped',
          source_url: lead.sourceUrl,
        },
      });
    }

    await db.insertSubmissions(submissions);
    await db.insertReports(reports);

    console.log(
      `${submissions.length} new lead(s) queued for review, ${alreadyKnown} already known, ` +
        `${reports.length} timing conflict(s) filed.`,
    );
    console.log('Nothing went live. Open /admin to work the queue.');
  } finally {
    await db.close();
  }

  await writeLeadReport(collected, skippedSources, rejectedHeadings, false);
}

function matchExisting(
  lead: LeadRecord,
  existing: Place[],
  center: { lat: number; lng: number } | undefined,
): Place | undefined {
  // With a locality we can use the geographic dedupe; without one, fall back to
  // an exact normalized-name match, which is stricter and avoids false merges.
  if (center) {
    const nearby = findDuplicate({ name: lead.name, ...center }, existing, 4_000);
    if (nearby) return nearby;
  }
  const key = normalizeName(lead.name);
  return existing.find((place) => normalizeName(place.name) === key);
}

async function writeLeadReport(
  leads: LeadRecord[],
  skippedSources: string[],
  rejectedHeadings: string[],
  dryRun: boolean,
): Promise<void> {
  const lines = ['# Listicle lead report', ''];
  lines.push(`${leads.length} lead(s)${dryRun ? ' (dry run)' : ''}.`);
  lines.push('');
  lines.push('Claimed timings below are **hearsay from blog posts**, not data. Nothing here is');
  lines.push('published until you approve it in /admin.');
  lines.push('');
  lines.push('| Place | Area guess | Claimed timing | Source |');
  lines.push('|---|---|---|---|');
  for (const lead of leads) {
    lines.push(
      `| ${lead.name} | ${lead.areaSlug ?? lead.locality ?? '—'} | ${lead.claimedTiming ?? '—'} | ${lead.sourceUrl} |`,
    );
  }
  lines.push('');

  if (skippedSources.length > 0) {
    lines.push('## Sources skipped');
    lines.push('');
    for (const skipped of skippedSources) lines.push(`- ${skipped}`);
    lines.push('');
  }

  if (rejectedHeadings.length > 0) {
    lines.push('## Headings the extractor ignored');
    lines.push('');
    lines.push('Logged so misses are visible. If a real place is in here, add it by hand.');
    lines.push('');
    for (const heading of [...new Set(rejectedHeadings)].slice(0, 60)) lines.push(`- ${heading}`);
    lines.push('');
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(resolve(OUTPUT_DIR, 'lead-report.md'), lines.join('\n'), 'utf8');
}

main().catch((error: unknown) => {
  console.error(`scrape:leads failed — ${(error as Error).message}`);
  process.exitCode = 1;
});
