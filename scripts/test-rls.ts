import pg from 'pg';
import { flagValue, requireEnv } from './lib/env';

/**
 * Proves the security model from docs/02 against a real database, because
 * "the policy looks right" is not evidence. The anon key ships to every
 * browser; everything asserted here is what a hostile visitor would be able to
 * try with it.
 *
 *   npm run rls:test -- --url=postgresql://postgres@127.0.0.1:54329/postgres
 *
 * Exits non-zero on the first violation.
 */

interface Check {
  name: string;
  run: (client: pg.Client) => Promise<void>;
}

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

/** Assert the statement is refused. A statement that succeeds is a failure. */
async function mustFail(client: pg.Client, sql: string, params: unknown[] = []): Promise<void> {
  try {
    await client.query(sql, params);
  } catch {
    return; // Refused, as intended.
  }
  throw new Error('statement succeeded but should have been refused');
}

const checks: Check[] = [
  {
    name: 'anon can read approved places',
    run: async (client) => {
      const { rows } = await client.query<{ slug: string }>(
        "select slug from places where slug = 'rls-approved'",
      );
      if (rows.length !== 1) throw new Error(`expected 1 approved row, got ${rows.length}`);
    },
  },
  {
    name: 'anon CANNOT read pending places',
    run: async (client) => {
      const { rows } = await client.query("select slug from places where slug = 'rls-pending'");
      if (rows.length !== 0) throw new Error(`pending row leaked to anon (${rows.length} rows)`);
    },
  },
  {
    name: 'anon CANNOT read rejected or archived places',
    run: async (client) => {
      const { rows } = await client.query(
        "select slug from places where status in ('rejected','archived')",
      );
      if (rows.length !== 0) throw new Error(`${rows.length} non-approved rows leaked`);
    },
  },
  {
    name: 'anon CANNOT count around the policy',
    run: async (client) => {
      const { rows } = await client.query<{ count: string }>('select count(*)::text from places');
      // Only the approved fixture should be visible.
      if (rows[0]?.count !== '1') throw new Error(`count(*) returned ${rows[0]?.count}, expected 1`);
    },
  },
  {
    name: 'anon CANNOT insert a place',
    run: (client) =>
      mustFail(
        client,
        "insert into places (slug, name, lat, lng, source) values ('rls-hack','Hack',19,72.8,'community')",
      ),
  },
  {
    name: 'anon CANNOT update a place',
    run: (client) => mustFail(client, "update places set name = 'Owned' where slug = 'rls-approved'"),
  },
  {
    name: 'anon CANNOT promote a pending place to approved',
    run: (client) =>
      mustFail(client, "update places set status = 'approved' where slug = 'rls-pending'"),
  },
  {
    name: 'anon CANNOT delete a place',
    run: (client) => mustFail(client, "delete from places where slug = 'rls-approved'"),
  },
  {
    name: 'anon CANNOT read submissions',
    run: (client) => mustFail(client, 'select * from submissions'),
  },
  {
    name: 'anon CANNOT insert submissions directly (must go via the API route)',
    run: (client) =>
      mustFail(client, `insert into submissions (payload, ip_hash) values ('{}'::jsonb, 'x')`),
  },
  {
    name: 'anon CANNOT read reports',
    run: (client) => mustFail(client, 'select * from reports'),
  },
  {
    name: 'anon CANNOT insert reports directly',
    run: (client) =>
      mustFail(
        client,
        `insert into reports (place_id, reason, ip_hash)
         select id, 'other', 'x' from places limit 1`,
      ),
  },
  {
    name: 'anon can read areas (needed for the area chips)',
    run: async (client) => {
      await client.query('select count(*) from areas');
    },
  },
  {
    name: 'anon CANNOT write areas',
    run: (client) =>
      mustFail(
        client,
        "insert into areas (slug, name, sort_order, center_lat, center_lng) values ('x','X',99,19,72.8)",
      ),
  },
  {
    name: 'authenticated (a logged-in admin session) is no more privileged than anon',
    run: async (client) => {
      await client.query('set role authenticated');
      try {
        const { rows } = await client.query("select slug from places where slug = 'rls-pending'");
        if (rows.length !== 0) throw new Error('pending row visible to authenticated role');
        await mustFail(client, 'select * from submissions');
      } finally {
        await client.query('set role anon');
      }
    },
  },
];

async function main(): Promise<void> {
  const url = flagValue('url') ?? requireEnv('SUPABASE_DB_URL');
  const isLocal = url.includes('localhost') || url.includes('127.0.0.1');

  const admin = new pg.Client({
    connectionString: url,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  });
  await admin.connect();

  try {
    // Fixtures, inserted with full privileges.
    await admin.query("delete from places where slug like 'rls-%'");
    await admin.query(`
      insert into places (slug, name, lat, lng, source, status) values
        ('rls-approved', 'RLS Approved Fixture', 19.06, 72.83, 'manual', 'approved'),
        ('rls-pending',  'RLS Pending Fixture',  19.06, 72.83, 'osm',    'pending'),
        ('rls-rejected', 'RLS Rejected Fixture', 19.06, 72.83, 'osm',    'rejected'),
        ('rls-archived', 'RLS Archived Fixture', 19.06, 72.83, 'osm',    'archived')
    `);

    await admin.query('set role anon');

    for (const check of checks) {
      try {
        await check.run(admin);
        results.push({ name: check.name, ok: true });
      } catch (error) {
        results.push({ name: check.name, ok: false, detail: (error as Error).message });
        // A failed statement can poison the transaction state; reset the role.
        await admin.query('reset role').catch(() => undefined);
        await admin.query('set role anon').catch(() => undefined);
      }
    }

    await admin.query('reset role');
    await admin.query("delete from places where slug like 'rls-%'");
  } finally {
    await admin.end();
  }

  const failed = results.filter((result) => !result.ok);
  for (const result of results) {
    console.log(`${result.ok ? '  ok  ' : '  FAIL'} ${result.name}${result.detail ? ` — ${result.detail}` : ''}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} RLS checks passed.`);

  if (failed.length > 0) {
    console.error('\nRLS is not airtight. Fix the policies before shipping.');
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(`rls:test failed — ${(error as Error).message}`);
  process.exitCode = 1;
});
