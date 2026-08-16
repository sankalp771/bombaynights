import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { slugify } from '@/lib/format';
import { weeklyHoursSchema } from '@/lib/hours';
import { isLateNight } from '@/lib/openNow';
import { categorySchema, foodTypeSchema, serviceModeSchema } from '@/lib/types';
import { AREAS, areaBySlug } from './areas';
import { findDuplicate } from './lib/dedupe';
import { openDb, type PlaceUpsert } from './lib/db';
import { flagValue, hasFlag } from './lib/env';

/**
 * Inlet 2 — the owner's hand-curated CSV (docs/03). This is the highest-quality
 * data in the system and the actual moat, so the rules are strict:
 *
 *   · a bad row is a loud, numbered error — never a silent skip
 *   · a manual row always wins over an OSM row for the same place, and takes
 *     over that row rather than creating a duplicate
 *   · hours still land as `hours_verified = false`; only the owner flipping the
 *     toggle in /admin earns the ✓ badge
 *
 *   npm run seed:manual
 *   npm run seed:manual -- --dry-run
 *   npm run seed:manual -- --file=data/manual-seed.csv
 */

const DEFAULT_FILE = 'data/manual-seed.csv';

const pipeList = (schema: z.ZodTypeAny) =>
  z
    .string()
    .optional()
    .transform((value) =>
      (value ?? '')
        .split(/[|;]/)
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean),
    )
    .pipe(z.array(schema));

const optionalBoolean = z
  .string()
  .optional()
  .transform((value) => {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) return null;
    if (['true', 'yes', 'y', '1'].includes(normalized)) return true;
    if (['false', 'no', 'n', '0'].includes(normalized)) return false;
    return undefined; // caught by the refine below
  })
  .refine((value) => value !== undefined, { message: 'Expected true/false/yes/no or empty' });

const optionalText = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  });

const rowSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  area_slug: z
    .string()
    .trim()
    .refine((slug) => Boolean(areaBySlug(slug)), {
      message: `must be one of: ${AREAS.map((area) => area.slug).join(', ')}`,
    }),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  address: optionalText,
  categories: pipeList(categorySchema),
  food_type: z
    .string()
    .optional()
    .transform((value) => (value?.trim() ? value.trim().toLowerCase() : 'unknown'))
    .pipe(foodTypeSchema),
  serves_alcohol: optionalBoolean,
  last_call: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    })
    .refine((value) => value === null || /^\d{2}:\d{2}$/.test(value), {
      message: 'last_call must be HH:MM or empty',
    }),
  has_shisha: optionalBoolean,
  service_modes: pipeList(serviceModeSchema),
  hours_json: z
    .string()
    .optional()
    .transform((value, ctx) => {
      const trimmed = value?.trim();
      if (!trimmed) return null;
      try {
        return weeklyHoursSchema.parse(JSON.parse(trimmed));
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `hours_json is not valid: ${(error as Error).message.split('\n')[0]}`,
        });
        return z.NEVER;
      }
    }),
  price_band: z
    .string()
    .optional()
    .transform((value) => (value?.trim() ? Number(value.trim()) : null))
    .refine((value) => value === null || (Number.isInteger(value) && value >= 1 && value <= 4), {
      message: 'price_band must be 1–4 or empty',
    }),
  phone: optionalText,
  notes: optionalText,
});

async function main(): Promise<void> {
  const dryRun = hasFlag('dry-run');
  const file = flagValue('file') ?? DEFAULT_FILE;

  const contents = await readFile(resolve(process.cwd(), file), 'utf8');
  const records = parse(contents, {
    columns: true,
    skip_empty_lines: true,
    trim: false,
    bom: true,
  }) as Array<Record<string, string>>;

  const errors: string[] = [];
  const rows: Array<z.infer<typeof rowSchema>> = [];

  records.forEach((record, index) => {
    // +2: one for the header row, one because humans count from 1.
    const lineNumber = index + 2;
    const parsed = rowSchema.safeParse(record);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`  line ${lineNumber} · ${issue.path.join('.') || 'row'}: ${issue.message}`);
      }
      return;
    }
    rows.push(parsed.data);
  });

  if (errors.length > 0) {
    console.error(`${file} has ${errors.length} problem(s):\n${errors.join('\n')}`);
    throw new Error('Fix the CSV and run again — nothing was written.');
  }

  const slugCounts = new Map<string, number>();
  const prepared = rows.map((row) => {
    const area = areaBySlug(row.area_slug);
    const slug = slugify(row.name, area?.name);
    slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);
    return { row, slug, area };
  });

  const duplicateSlugs = [...slugCounts.entries()].filter(([, count]) => count > 1);
  if (duplicateSlugs.length > 0) {
    throw new Error(
      `Two rows produce the same slug: ${duplicateSlugs.map(([slug]) => slug).join(', ')}. ` +
        'Distinguish them by name (e.g. add the locality) — slugs are the public URL.',
    );
  }

  console.log(`${rows.length} valid row(s) in ${file}.`);
  const notLateNight = prepared.filter(({ row }) => row.hours_json && !isLateNight(row.hours_json));
  for (const { row } of notLateNight) {
    console.warn(
      `  ! "${row.name}" closes before midnight. It is kept — you added it deliberately — ` +
        'but it will not appear in late-night filters.',
    );
  }

  if (dryRun) {
    console.log('\nDry run — nothing will be written. Rows that would be upserted:');
    for (const { row, slug } of prepared) {
      console.log(`  ${slug.padEnd(40)} ${row.categories.join('|') || '(no categories)'}`);
    }
    return;
  }

  const db = openDb();
  try {
    console.log(`Writing to ${db.label}`);
    const areaRows = await db.listAreas();
    if (areaRows.length === 0) {
      throw new Error('The areas table is empty — run `npm run seed:areas` first.');
    }
    const areaIdBySlug = new Map(areaRows.map((area) => [area.slug, area.id]));
    const existing = await db.listPlaces();

    const upserts: PlaceUpsert[] = [];
    let takeovers = 0;

    for (const { row, slug } of prepared) {
      // Manual beats OSM: if this place already exists as a seeded OSM row
      // within 150 m, take that row over instead of creating a second one.
      const osmRows = existing.filter((place) => place.source === 'osm');
      const match = findDuplicate({ name: row.name, lat: row.lat, lng: row.lng }, osmRows);
      const targetSlug = match?.slug ?? slug;
      if (match) takeovers += 1;

      upserts.push({
        slug: targetSlug,
        name: row.name,
        area_id: areaIdBySlug.get(row.area_slug) ?? null,
        address: row.address,
        lat: row.lat,
        lng: row.lng,
        categories: row.categories,
        food_type: row.food_type,
        serves_alcohol: row.serves_alcohol,
        last_call: row.last_call,
        has_shisha: row.has_shisha,
        service_modes: row.service_modes,
        hours: row.hours_json,
        // Owner-entered, but still unverified until confirmed in /admin.
        hours_verified: false,
        price_band: row.price_band,
        phone: row.phone,
        notes: row.notes,
        status: 'approved',
        source: 'manual',
      });
    }

    await db.upsertPlaces(upserts, 'slug');
    console.log(
      `Upserted ${upserts.length} place(s)` +
        (takeovers > 0 ? `, ${takeovers} of which took over an existing OSM row.` : '.'),
    );
    console.log('All are approved and unverified — flip hours_verified in /admin once confirmed.');
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error(`\nseed:manual failed — ${(error as Error).message}`);
  process.exitCode = 1;
});
