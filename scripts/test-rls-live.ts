import { optionalEnv, requireEnv } from './lib/env';
import { createManagementRunner, refFromSupabaseUrl } from './lib/sqlRunner';

/**
 * Proves the security model against the **live Supabase project**, over HTTPS.
 *
 *   npm run rls:test:live
 *
 * `rls:test` does the same job by connecting as Postgres and dropping to the
 * `anon` role. This one is complementary and, for a deployed project, stricter:
 * it goes through PostgREST with the actual public anon key, which is the exact
 * surface a hostile visitor has. A policy can be right in SQL and still be
 * defeated by an exposed view, a permissive grant, or a table someone forgot to
 * enable RLS on — only a real request finds that.
 *
 * Fixtures are inserted with the service role (via the Management API), probed
 * with the anon key, then removed. Exits non-zero on the first violation.
 */

const FIXTURE_PREFIX = 'rls-live-';

interface Check {
  name: string;
  run: () => Promise<void>;
}

let supabaseUrl = '';
let anonKey = '';

async function anon(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: string }> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  return { status: response.status, body: await response.text() };
}

/** A write that succeeds is a failure. 2xx means the door was open. */
async function mustRefuse(label: string, path: string, init: RequestInit): Promise<void> {
  const { status, body } = await anon(path, init);
  if (status >= 200 && status < 300) {
    throw new Error(
      `${label} succeeded with ${status} — it must be refused. Body: ${body.slice(0, 200)}`,
    );
  }
}

async function rows(path: string): Promise<unknown[]> {
  const { status, body } = await anon(path);
  if (status === 200) {
    const parsed: unknown = JSON.parse(body || '[]');
    return Array.isArray(parsed) ? parsed : [];
  }
  // 401/403/404 all mean "not readable", which is what we are checking for.
  return [];
}

const checks: Check[] = [
  {
    name: 'anon can read approved places',
    run: async () => {
      const found = await rows(`places?slug=eq.${FIXTURE_PREFIX}approved&select=slug`);
      if (found.length !== 1) throw new Error(`expected the approved fixture, got ${found.length}`);
    },
  },
  {
    name: 'anon CANNOT read pending places',
    run: async () => {
      const found = await rows(`places?slug=eq.${FIXTURE_PREFIX}pending&select=slug`);
      if (found.length !== 0) throw new Error('a pending place leaked to anon');
    },
  },
  {
    name: 'anon CANNOT read rejected places',
    run: async () => {
      const found = await rows(`places?slug=eq.${FIXTURE_PREFIX}rejected&select=slug`);
      if (found.length !== 0) throw new Error('a rejected place leaked to anon');
    },
  },
  {
    name: 'anon CANNOT read archived places',
    run: async () => {
      const found = await rows(`places?slug=eq.${FIXTURE_PREFIX}archived&select=slug`);
      if (found.length !== 0) throw new Error('an archived place leaked to anon');
    },
  },
  {
    name: 'anon CANNOT count around the policy',
    run: async () => {
      // A count with `Prefer: count=exact` must also respect RLS.
      const response = await fetch(`${supabaseUrl}/rest/v1/places?status=eq.pending&select=id`, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          Prefer: 'count=exact',
          Range: '0-0',
        },
        signal: AbortSignal.timeout(30_000),
      });
      const range = response.headers.get('content-range') ?? '';
      const total = Number(range.split('/')[1] ?? '0');
      if (total > 0) throw new Error(`pending count leaked: ${range}`);
    },
  },
  {
    name: 'anon CANNOT insert a place',
    run: () =>
      mustRefuse('insert into places', 'places', {
        method: 'POST',
        body: JSON.stringify({
          slug: `${FIXTURE_PREFIX}hacked`,
          name: 'Hacked',
          lat: 19,
          lng: 72.8,
          status: 'approved',
          source: 'community',
        }),
      }),
  },
  {
    name: 'anon CANNOT update a place',
    run: () =>
      mustRefuse('update places', `places?slug=eq.${FIXTURE_PREFIX}approved`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Renamed by a stranger' }),
      }),
  },
  {
    name: 'anon CANNOT delete a place',
    run: () =>
      mustRefuse('delete from places', `places?slug=eq.${FIXTURE_PREFIX}approved`, {
        method: 'DELETE',
      }),
  },
  {
    name: 'anon CANNOT promote a pending place to approved',
    run: () =>
      mustRefuse('update status', `places?slug=eq.${FIXTURE_PREFIX}pending`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved' }),
      }),
  },
  {
    name: 'anon CANNOT read submissions',
    run: async () => {
      const found = await rows('submissions?select=id');
      if (found.length !== 0) throw new Error(`${found.length} submissions readable by anon`);
    },
  },
  {
    name: 'anon CANNOT insert a submission directly',
    run: () =>
      // Submissions only ever arrive through the rate-limited API route.
      mustRefuse('insert into submissions', 'submissions', {
        method: 'POST',
        body: JSON.stringify({ payload: {}, ip_hash: 'x' }),
      }),
  },
  {
    name: 'anon CANNOT read reports',
    run: async () => {
      const found = await rows('reports?select=id');
      if (found.length !== 0) throw new Error(`${found.length} reports readable by anon`);
    },
  },
  {
    name: 'anon CANNOT insert a report directly',
    run: () =>
      mustRefuse('insert into reports', 'reports', {
        method: 'POST',
        body: JSON.stringify({
          place_id: '00000000-0000-4000-8000-000000000000',
          reason: 'other',
          ip_hash: 'x',
        }),
      }),
  },
  {
    name: 'anon can read areas (the public site needs them)',
    run: async () => {
      const found = await rows('areas?select=slug');
      if (found.length === 0) throw new Error('areas are not readable — the site cannot render');
    },
  },
  {
    name: 'anon CANNOT write areas',
    run: () =>
      mustRefuse('insert into areas', 'areas', {
        method: 'POST',
        body: JSON.stringify({ slug: 'hacked', name: 'Hacked', sort_order: 99 }),
      }),
  },
];

async function main(): Promise<void> {
  supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
  anonKey =
    optionalEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ??
    requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

  const token = requireEnv('SUPABASE_ACCESS_TOKEN');
  const runner = createManagementRunner(refFromSupabaseUrl(supabaseUrl), token);

  console.log(`Probing ${supabaseUrl} with the public anon key\n`);

  try {
    await seedFixtures(runner);

    let failed = 0;
    for (const check of checks) {
      try {
        await check.run();
        console.log(`  ✓ ${check.name}`);
      } catch (error) {
        failed += 1;
        console.error(`  ✗ ${check.name}\n      ${(error as Error).message}`);
      }
    }

    console.log(`\n${checks.length - failed}/${checks.length} checks passed.`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await cleanUp(runner);
    await runner.close();
  }
}

async function seedFixtures(runner: { query: (sql: string) => Promise<unknown[]> }): Promise<void> {
  await runner.query(`
    delete from places where slug like '${FIXTURE_PREFIX}%';
    insert into places (slug, name, lat, lng, status, source)
    values
      ('${FIXTURE_PREFIX}approved', 'RLS live approved', 19.0600, 72.8300, 'approved', 'manual'),
      ('${FIXTURE_PREFIX}pending',  'RLS live pending',  19.0601, 72.8301, 'pending',  'manual'),
      ('${FIXTURE_PREFIX}rejected', 'RLS live rejected', 19.0602, 72.8302, 'rejected', 'manual'),
      ('${FIXTURE_PREFIX}archived', 'RLS live archived', 19.0603, 72.8303, 'archived', 'manual');
  `);
}

async function cleanUp(runner: { query: (sql: string) => Promise<unknown[]> }): Promise<void> {
  await runner.query(`delete from places where slug like '${FIXTURE_PREFIX}%';`);
  console.log('Fixtures removed.');
}

main().catch((error: unknown) => {
  console.error(`\nrls:test:live failed — ${(error as Error).message}`);
  process.exitCode = 1;
});
