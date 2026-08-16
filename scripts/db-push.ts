import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { flagValue, hasFlag, optionalEnv, requireEnv } from './lib/env';
import {
  createManagementRunner,
  createPostgresRunner,
  refFromSupabaseUrl,
  type SqlRunner,
} from './lib/sqlRunner';

/**
 * Applies `supabase/migrations/*.sql` in filename order, once each, tracked in
 * a `schema_migrations` table. Migrations in git are the source of truth — never
 * paste SQL into the Supabase dashboard (docs/06).
 *
 * Transport is picked in this order:
 *   1. `--url=postgres://…` or `SUPABASE_DB_URL`  → direct `pg` (local dev)
 *   2. `SUPABASE_ACCESS_TOKEN`                    → Supabase Management API over
 *                                                   HTTPS, the only path that
 *                                                   works where port 5432 is
 *                                                   blocked. `--ref=` overrides
 *                                                   the ref read from
 *                                                   NEXT_PUBLIC_SUPABASE_URL.
 *
 *   npm run db:push                    apply pending migrations
 *   npm run db:push -- --local         also create the Supabase roles locally
 *   npm run db:push -- --fresh         drop and rebuild public schema first
 *   npm run db:push -- --dry-run       list what would run
 *   npm run db:push -- --status        show what is applied, change nothing
 */

const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase/migrations');
const BOOTSTRAP = resolve(process.cwd(), 'supabase/local-bootstrap.sql');

async function main(): Promise<void> {
  const local = hasFlag('local');
  const fresh = hasFlag('fresh');
  const dryRun = hasFlag('dry-run');
  const status = hasFlag('status');

  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort();
  if (files.length === 0) throw new Error(`No migrations found in ${MIGRATIONS_DIR}`);

  const { runner, remote } = createRunner();

  if (dryRun) {
    console.log(`Would apply against ${runner.label}:`);
    for (const file of files) console.log(`  · ${file}`);
    await runner.close();
    return;
  }

  // `--fresh` drops the whole public schema. That is routine against a local
  // throwaway database and catastrophic against the real project, so the remote
  // transport demands you say so twice.
  if (fresh && remote && !hasFlag('force')) {
    throw new Error(
      `--fresh would DROP SCHEMA public on ${runner.label}, destroying every place, ` +
        `submission and report in it. Re-run with --force if that is genuinely what you want.`,
    );
  }

  console.log(`Connected to ${runner.label}`);

  try {
    if (fresh) {
      console.log('--fresh: dropping and recreating schema public');
      await runner.query('drop schema if exists public cascade; create schema public;');
      await runner.query('grant all on schema public to postgres;');
    }

    if (local) {
      if (remote) {
        throw new Error('--local creates Supabase-equivalent roles; the real project has them.');
      }
      console.log('--local: creating Supabase-equivalent roles');
      await runner.query(await readFile(BOOTSTRAP, 'utf8'));
    }

    await runner.query(`
      create table if not exists schema_migrations (
        version    text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const applied = new Set(
      (await runner.query<{ version: string }>('select version from schema_migrations')).map(
        (row) => row.version,
      ),
    );

    if (status) {
      for (const file of files) console.log(`  ${applied.has(file) ? '+' : '·'} ${file}`);
      console.log(`${applied.size}/${files.length} applied.`);
      return;
    }

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  = ${file} (already applied)`);
        continue;
      }
      const sql = await readFile(resolve(MIGRATIONS_DIR, file), 'utf8');
      // One multi-statement string is one implicit transaction on both
      // transports, so a migration and its version row land together or not at
      // all. Do not split this into two calls.
      try {
        await runner.query(
          `${sql}\n;\ninsert into schema_migrations (version) values (${quote(file)});`,
        );
        console.log(`  + ${file}`);
        ran += 1;
      } catch (error) {
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
    }

    console.log(ran === 0 ? 'Already up to date.' : `Applied ${ran} migration(s).`);
  } finally {
    await runner.close();
  }
}

function createRunner(): { runner: SqlRunner; remote: boolean } {
  // `--url=` is an explicit choice and the only way to reach a local database,
  // so it wins outright. Otherwise prefer the HTTPS transport, because a
  // configured `SUPABASE_DB_URL` is useless wherever 5432 is blocked.
  const explicitUrl = flagValue('url');
  if (explicitUrl) {
    return { runner: createPostgresRunner(explicitUrl), remote: !isLocalUrl(explicitUrl) };
  }

  const token = optionalEnv('SUPABASE_ACCESS_TOKEN');
  if (token) {
    const ref = flagValue('ref') ?? refFromSupabaseUrl(requireEnv('NEXT_PUBLIC_SUPABASE_URL'));
    return { runner: createManagementRunner(ref, token), remote: true };
  }

  const envUrl = optionalEnv('SUPABASE_DB_URL');
  if (envUrl) {
    return { runner: createPostgresRunner(envUrl), remote: !isLocalUrl(envUrl) };
  }

  throw new Error(
    'No way to reach a database. Set SUPABASE_ACCESS_TOKEN (a Supabase personal ' +
      'access token, works over HTTPS) or SUPABASE_DB_URL / --url=postgres://… ' +
      '(direct connection, needs port 5432 open).',
  );
}

function isLocalUrl(url: string): boolean {
  return url.includes('localhost') || url.includes('127.0.0.1');
}

/** Single-quoted SQL literal. Only ever fed a filename from our own directory. */
function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

main().catch((error: unknown) => {
  console.error(`\ndb:push failed — ${(error as Error).message}`);
  process.exitCode = 1;
});
