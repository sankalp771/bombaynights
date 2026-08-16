import { AREAS } from './areas';
import { openDb } from './lib/db';
import { hasFlag } from './lib/env';

/**
 * Pushes the corridor definition in areas.ts into the `areas` table. Safe to
 * re-run: it upserts on slug, so editing an intro or nudging a centre and
 * re-running just updates the row.
 *
 *   npm run seed:areas
 *   npm run seed:areas -- --dry-run
 *   npm run seed:areas -- --url=postgresql://…
 */
async function main(): Promise<void> {
  const dryRun = hasFlag('dry-run');
  const rows = AREAS.map((area) => ({
    slug: area.slug,
    name: area.name,
    sort_order: area.sortOrder,
    center_lat: area.center.lat,
    center_lng: area.center.lng,
    intro: area.intro,
  }));

  if (dryRun) {
    console.log(`Would upsert ${rows.length} areas:`);
    for (const row of rows) console.log(`  ${String(row.sort_order).padStart(2)}. ${row.name}`);
    return;
  }

  const db = openDb();
  try {
    console.log(`Seeding areas into ${db.label}`);
    await db.upsertAreas(rows);
    const stored = await db.listAreas();
    console.log(`${stored.length} areas in the database:`);
    for (const area of stored) {
      console.log(`  ${String(area.sort_order).padStart(2)}. ${area.name} (${area.slug})`);
    }
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error(`seed:areas failed — ${(error as Error).message}`);
  process.exitCode = 1;
});
