import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AREAS, type AreaDefinition } from './areas';
import { openDb, type Db, type PlaceUpsert } from './lib/db';
import { flagValue, hasFlag } from './lib/env';
import { buildQuery, OverpassUnavailableError, runQuery } from './lib/overpass';
import {
  mapOverpassElement,
  overpassResponseSchema,
  type MappedPlace,
  type SkipReason,
} from './lib/osmMap';
import { findDuplicate } from './lib/dedupe';
import { hasMidnightTruncation } from './lib/osmHours';
import type { Area, Place } from '@/lib/types';

/**
 * Inlet 1 — seed from OpenStreetMap via Overpass (docs/03).
 *
 *   npm run seed:osm                     full run against the configured DB
 *   npm run seed:osm -- --dry-run        fetch, classify, report; write nothing
 *   npm run seed:osm -- --diff           monthly-refresh mode (see below)
 *   npm run seed:osm -- --area=bandra    one area only
 *   npm run seed:osm -- --fixture=path   read a saved Overpass response instead
 *                                        of the network (offline dev + CI)
 *
 * ## Refresh rules (`--diff`)
 *
 * Owner-verified data is never machine-overwritten. Machines propose, the owner
 * disposes:
 *   · new in OSM                            → insert as `pending`
 *   · changed, `hours_verified = false`     → update in place
 *   · changed, `hours_verified = true`      → leave alone, file an
 *                                             `osm_hours_drifted` report
 *   · vanished from OSM                     → never delete, report only
 */

const OUTPUT_DIR = resolve(process.cwd(), 'scripts/output');
const REPORT_PATH = resolve(OUTPUT_DIR, 'seed-report.md');

interface AreaStats {
  area: AreaDefinition;
  fetched: number;
  included: number;
  withHours: number;
  withoutHours: number;
  inserted: number;
  updated: number;
  driftReported: number;
  dedupedAgainstManual: number;
  skipped: Record<SkipReason, number>;
  error?: string;
}

function emptySkips(): Record<SkipReason, number> {
  return {
    'invalid-element': 0,
    'no-name': 0,
    'no-coordinates': 0,
    'outside-corridor': 0,
    'closes-before-midnight': 0,
    'no-hours-and-not-a-night-venue': 0,
  };
}

async function main(): Promise<void> {
  const dryRun = hasFlag('dry-run');
  const diffMode = hasFlag('diff');
  const areaFilter = flagValue('area');
  const fixturePath = flagValue('fixture');

  const areas = areaFilter ? AREAS.filter((area) => area.slug === areaFilter) : [...AREAS];
  if (areas.length === 0) throw new Error(`Unknown area "${areaFilter}"`);

  const fixture = fixturePath ? await loadFixture(fixturePath) : null;

  let db: Db | null = null;
  let existingPlaces: Place[] = [];
  let areaRows: Area[] = [];

  if (!dryRun) {
    db = openDb();
    console.log(`Seeding into ${db.label}`);
    areaRows = await db.listAreas();
    if (areaRows.length === 0) {
      throw new Error('The areas table is empty — run `npm run seed:areas` first.');
    }
    existingPlaces = await db.listPlaces();
    console.log(`${existingPlaces.length} places already stored.`);
  } else {
    console.log('Dry run — nothing will be written.');
  }

  const areaIdBySlug = new Map(areaRows.map((row) => [row.slug, row.id]));
  const manualPlaces = existingPlaces.filter(
    (place) => place.source === 'manual' || place.source === 'community',
  );
  const byOsmId = new Map(
    existingPlaces.filter((place) => place.osm_id).map((place) => [place.osm_id as string, place]),
  );

  const stats: AreaStats[] = [];
  const seenOsmIds = new Set<string>();
  const needsReview: Array<{ name: string; area: string; raw: string | null }> = [];
  let overpassDown = false;

  for (const area of areas) {
    const areaStats: AreaStats = {
      area,
      fetched: 0,
      included: 0,
      withHours: 0,
      withoutHours: 0,
      inserted: 0,
      updated: 0,
      driftReported: 0,
      dedupedAgainstManual: 0,
      skipped: emptySkips(),
    };
    stats.push(areaStats);

    let raw: unknown;
    try {
      raw = fixture ?? (await runQuery(buildQuery(area.bbox)));
    } catch (error) {
      if (error instanceof OverpassUnavailableError) {
        overpassDown = true;
        areaStats.error = error.message.split('\n')[0];
        console.error(`  ! ${area.name}: ${areaStats.error}`);
        continue;
      }
      throw error;
    }

    const parsed = overpassResponseSchema.safeParse(raw);
    if (!parsed.success) {
      areaStats.error = 'Overpass returned an unexpected shape';
      console.error(`  ! ${area.name}: ${areaStats.error}`);
      continue;
    }

    const candidates: MappedPlace[] = [];
    for (const element of parsed.data.elements) {
      areaStats.fetched += 1;
      const outcome = mapOverpassElement(element);
      if (outcome.kind === 'skipped') {
        areaStats.skipped[outcome.reason] += 1;
        continue;
      }
      // A fixture is replayed for every area, and bboxes can overlap at the
      // seams; the osm_id set keeps each place to exactly one area.
      if (seenOsmIds.has(outcome.place.osm_id)) continue;
      if (outcome.place.area?.slug !== area.slug) continue;
      seenOsmIds.add(outcome.place.osm_id);
      candidates.push(outcome.place);
    }

    const toUpsert: PlaceUpsert[] = [];
    const driftReports: Array<{ place_id: string; reason: string; detail: string }> = [];

    for (const candidate of candidates) {
      areaStats.included += 1;
      if (candidate.hours) areaStats.withHours += 1;
      else areaStats.withoutHours += 1;

      if (hasMidnightTruncation(candidate.hours)) {
        needsReview.push({ name: candidate.name, area: area.name, raw: candidate.rawOpeningHours });
      }

      // A hand-curated row always wins over OSM at the same spot.
      const manualMatch = findDuplicate(
        { name: candidate.name, lat: candidate.lat, lng: candidate.lng },
        manualPlaces.map((place) => ({ ...place, lat: place.lat, lng: place.lng })),
      );
      if (manualMatch) {
        areaStats.dedupedAgainstManual += 1;
        continue;
      }

      const existing = byOsmId.get(candidate.osm_id);
      const areaId = areaIdBySlug.get(area.slug) ?? null;

      if (!existing) {
        toUpsert.push(toRow(candidate, areaId));
        areaStats.inserted += 1;
        continue;
      }

      if (!diffMode) {
        // A plain re-run is idempotent: refresh the machine-owned fields only.
        toUpsert.push(toRow(candidate, areaId, existing));
        areaStats.updated += 1;
        continue;
      }

      const drifted = hoursDiffer(existing.hours, candidate.hours);
      if (existing.hours_verified) {
        if (drifted) {
          driftReports.push({
            place_id: existing.id,
            reason: 'osm_hours_drifted',
            detail:
              `OSM now says "${candidate.rawOpeningHours ?? 'no opening_hours'}" for ` +
              `${candidate.name}. Stored hours are owner-verified and were left untouched.`,
          });
          areaStats.driftReported += 1;
        }
        continue;
      }

      if (drifted || tagsDiffer(existing.categories, candidate.categories)) {
        toUpsert.push(toRow(candidate, areaId, existing));
        areaStats.updated += 1;
      }
    }

    if (db) {
      if (toUpsert.length > 0) await db.upsertPlaces(toUpsert, 'osm_id');
      if (driftReports.length > 0) {
        await db.insertReports(
          driftReports.map((report) => ({ ...report, ip_hash: 'system:osm-refresh' })),
        );
      }
    }

    console.log(
      `  ${area.name.padEnd(26)} fetched ${String(areaStats.fetched).padStart(4)} · ` +
        `kept ${String(areaStats.included).padStart(3)} · ` +
        `new ${String(areaStats.inserted).padStart(3)} · ` +
        `updated ${String(areaStats.updated).padStart(3)}` +
        (areaStats.driftReported ? ` · drift ${areaStats.driftReported}` : ''),
    );
  }

  const vanished = diffMode
    ? existingPlaces.filter(
        (place) =>
          place.source === 'osm' &&
          place.osm_id !== null &&
          place.status !== 'archived' &&
          !seenOsmIds.has(place.osm_id),
      )
    : [];

  await writeReport(stats, {
    dryRun,
    diffMode,
    overpassDown,
    vanished,
    needsReview,
    usedFixture: Boolean(fixture),
  });
  await db?.close();

  const totals = sum(stats);
  console.log(
    `\n${totals.included} places kept (${totals.withHours} with hours, ` +
      `${totals.withoutHours} needing verification). Report: scripts/output/seed-report.md`,
  );

  if (overpassDown && totals.included === 0) {
    console.error('Overpass was unreachable for every area — nothing was seeded.');
    process.exitCode = 1;
  }
}

function toRow(place: MappedPlace, areaId: number | null, existing?: Place): PlaceUpsert {
  return {
    slug: existing?.slug ?? place.slug,
    name: place.name,
    area_id: areaId,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    categories: place.categories,
    food_type: place.food_type,
    serves_alcohol: place.serves_alcohol,
    has_shisha: place.has_shisha,
    service_modes: place.service_modes,
    hours: place.hours,
    phone: place.phone,
    // Seeded rows arrive unverified; only a human flips this.
    hours_verified: existing?.hours_verified ?? false,
    status: existing?.status ?? 'pending',
    source: 'osm',
    osm_id: place.osm_id,
  };
}

function hoursDiffer(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
}

function tagsDiffer(a: readonly string[], b: readonly string[]): boolean {
  return [...a].sort().join(',') !== [...b].sort().join(',');
}

async function loadFixture(path: string): Promise<unknown> {
  const contents = await readFile(resolve(process.cwd(), path), 'utf8');
  return JSON.parse(contents);
}

function sum(stats: AreaStats[]) {
  return stats.reduce(
    (total, row) => ({
      fetched: total.fetched + row.fetched,
      included: total.included + row.included,
      withHours: total.withHours + row.withHours,
      withoutHours: total.withoutHours + row.withoutHours,
      inserted: total.inserted + row.inserted,
      updated: total.updated + row.updated,
      driftReported: total.driftReported + row.driftReported,
    }),
    {
      fetched: 0,
      included: 0,
      withHours: 0,
      withoutHours: 0,
      inserted: 0,
      updated: 0,
      driftReported: 0,
    },
  );
}

async function writeReport(
  stats: AreaStats[],
  context: {
    dryRun: boolean;
    diffMode: boolean;
    overpassDown: boolean;
    vanished: Place[];
    needsReview: Array<{ name: string; area: string; raw: string | null }>;
    usedFixture: boolean;
  },
): Promise<void> {
  const totals = sum(stats);
  const lines: string[] = [];

  lines.push('# OSM seed report');
  lines.push('');
  lines.push(
    `Mode: ${context.diffMode ? 'monthly refresh (--diff)' : 'seed'}${context.dryRun ? ' · dry run' : ''}${context.usedFixture ? ' · fixture' : ''}`,
  );
  lines.push('');
  if (context.overpassDown) {
    lines.push(
      '> **Overpass was unavailable for one or more areas.** Nothing user-facing depends ' +
        'on it — the areas below with an error simply were not refreshed this run.',
    );
    lines.push('');
  }

  lines.push('## Per area');
  lines.push('');
  lines.push(
    '| Area | Fetched | Kept | With hours | No hours | New | Updated | Drift | Dup vs manual |',
  );
  lines.push('|---|--:|--:|--:|--:|--:|--:|--:|--:|');
  for (const row of stats) {
    if (row.error) {
      lines.push(`| ${row.area.name} | — | — | — | — | — | — | — | _${row.error}_ |`);
      continue;
    }
    lines.push(
      `| ${row.area.name} | ${row.fetched} | ${row.included} | ${row.withHours} | ` +
        `${row.withoutHours} | ${row.inserted} | ${row.updated} | ${row.driftReported} | ${row.dedupedAgainstManual} |`,
    );
  }
  lines.push(
    `| **Total** | **${totals.fetched}** | **${totals.included}** | **${totals.withHours}** | ` +
      `**${totals.withoutHours}** | **${totals.inserted}** | **${totals.updated}** | **${totals.driftReported}** | |`,
  );
  lines.push('');

  lines.push('## Why entries were skipped');
  lines.push('');
  lines.push(
    '| Area | Closes before midnight | No hours, not a night venue | No name | No coords | Outside corridor |',
  );
  lines.push('|---|--:|--:|--:|--:|--:|');
  for (const row of stats) {
    lines.push(
      `| ${row.area.name} | ${row.skipped['closes-before-midnight']} | ` +
        `${row.skipped['no-hours-and-not-a-night-venue']} | ${row.skipped['no-name']} | ` +
        `${row.skipped['no-coordinates']} | ${row.skipped['outside-corridor']} |`,
    );
  }
  lines.push('');

  if (context.vanished.length > 0) {
    lines.push('## Gone from OSM — review, never auto-deleted');
    lines.push('');
    for (const place of context.vanished) {
      lines.push(`- ${place.name} (\`${place.slug}\`, ${place.osm_id})`);
    }
    lines.push('');
  }

  if (context.needsReview.length > 0) {
    lines.push('## Verify these first — closing time may be under-stated');
    lines.push('');
    lines.push(
      'These have a window ending at exactly midnight. In `opening_hours` syntax a later ' +
        'rule overrides the previous day’s spill past midnight, so `Mo-Th 18:00-01:00; ' +
        'Fr-Sa 18:00-03:00` really does evaluate with Thursday closing at 00:00. That is ' +
        'the spec-correct reading and we keep it — under-stating is the safe direction — ' +
        'but the mapper almost certainly meant a later close. Worth a phone call.',
    );
    lines.push('');
    lines.push('| Place | Area | Raw OSM `opening_hours` |');
    lines.push('|---|---|---|');
    for (const row of context.needsReview) {
      lines.push(`| ${row.name} | ${row.area} | \`${row.raw ?? ''}\` |`);
    }
    lines.push('');
  }

  lines.push('## What to do next');
  lines.push('');
  lines.push(
    `- ${totals.withoutHours} kept places have **no hours** — they are bars, pubs and lounges ` +
      'that skew late. They stay unverified until you confirm real timings.',
  );
  lines.push(
    '- OSM hours coverage in Mumbai is thin by design of the source, not of this script. ' +
      'The areas with low "Kept" counts above are where `data/manual-seed.csv` earns its keep.',
  );
  if (totals.driftReported > 0) {
    lines.push(
      `- ${totals.driftReported} verified place(s) drifted in OSM. They were **not** changed; ` +
        'open the Reports tab in /admin to review.',
    );
  }
  lines.push('');

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(REPORT_PATH, lines.join('\n'), 'utf8');
}

main().catch((error: unknown) => {
  console.error(`seed:osm failed — ${(error as Error).message}`);
  process.exitCode = 1;
});
