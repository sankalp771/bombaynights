import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The public, read-only Supabase client.
 *
 * This uses the **anon** key, which ships to browsers and is therefore treated
 * as public. It is safe only because RLS refuses everything except reading
 * approved places and the area list (supabase/migrations/0002_rls.sql, proven
 * by `npm run rls:test`). The service-role key is never imported from this file
 * or anything it reaches.
 */
export function createPublicClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required. ' +
        'Copy .env.example to .env.local and fill them in.',
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * The privileged client, for server-side routes only. Bypasses RLS, so it must
 * never be imported into a component that renders on the client. Every caller
 * validates its input with Zod and rate-limits before using this.
 */
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
