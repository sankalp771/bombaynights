import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { flagValue, hasFlag, requireEnv } from './lib/env';

/**
 * Applies `supabase/migrations/*.sql` in filename order, once each, tracked in
 * a `schema_migrations` table. Migrations in git are the source of truth — never
 * paste SQL into the Supabase dashboard (docs/06).
 *
 *   npm run db:push                    apply pending migrations
 *   npm run db:push -- --local         also create the Supabase roles locally
 *   npm run db:push -- --fresh         drop and rebuild public schema first
 *   npm run db:push -- --url=postgres://...
 *   npm run db:push -- --dry-run       list what would run
 */

const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase/migrations');
const BOOTSTRAP = resolve(process.cwd(), 'supabase/local-bootstrap.sql');

async function main(): Promise<void> {
  const url = flagValue('url') ?? requireEnv('SUPABASE_DB_URL');
  const local = hasFlag('local');
  const fresh = hasFlag('fresh');
  const dryRun = hasFlag('dry-run');

  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort();
  if (files.length === 0) throw new Error(`No migrations found in ${MIGRATIONS_DIR}`);

  if (dryRun) {
    console.log(`Would apply against ${redact(url)}:`);
    for (const file of files) console.log(`  · ${file}`);
    return;
  }

  const client = new pg.Client({
    connectionString: url,
    // Supabase terminates TLS with its own chain; verifying it adds nothing
    // here and breaks on some CI images.
    ssl:
      url.includes('localhost') || url.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  });

  await client.connect();
  console.log(`Connected to ${redact(url)}`);

  try {
    if (fresh) {
      console.log('--fresh: dropping and recreating schema public');
      await client.query('drop schema if exists public cascade; create schema public;');
      await client.query('grant all on schema public to postgres;');
    }

    if (local) {
      console.log('--local: creating Supabase-equivalent roles');
      await client.query(await readFile(BOOTSTRAP, 'utf8'));
    }

    await client.query(`
      create table if not exists schema_migrations (
        version    text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const applied = new Set(
      (await client.query<{ version: string }>('select version from schema_migrations')).rows.map(
        (row) => row.version,
      ),
    );

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  = ${file} (already applied)`);
        continue;
      }
      const sql = await readFile(resolve(MIGRATIONS_DIR, file), 'utf8');
      // Each migration is one transaction: it applies fully or not at all.
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (version) values ($1)', [file]);
        await client.query('commit');
        console.log(`  + ${file}`);
        ran += 1;
      } catch (error) {
        await client.query('rollback');
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
    }

    console.log(ran === 0 ? 'Already up to date.' : `Applied ${ran} migration(s).`);
  } finally {
    await client.end();
  }
}

function redact(url: string): string {
  return url.replace(/\/\/([^:]+):[^@]+@/, '//$1:***@');
}

main().catch((error: unknown) => {
  console.error(`\ndb:push failed — ${(error as Error).message}`);
  process.exitCode = 1;
});
