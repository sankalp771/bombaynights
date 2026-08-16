import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Admin authentication.
 *
 * There is exactly one admin — the owner — and no visitor ever logs in
 * (CLAUDE.md). So "authenticated" is not the same as "allowed": a Supabase
 * project accepts a sign-up from any email address, which would hand a stranger
 * an `authenticated` session. The only thing that grants access here is the
 * session's email matching `ADMIN_EMAIL`, checked on the server on every single
 * admin request.
 *
 * The anon key is used for the auth handshake only. Every admin *read* and
 * *write* goes through the service-role client, because RLS deliberately hides
 * pending places, submissions and reports from `authenticated` too.
 */

/** Shape `@supabase/ssr` hands back; it does not export this type. */
interface CookieToSet {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

export function adminEmail(): string {
  const email = process.env.ADMIN_EMAIL;
  if (!email || !email.trim()) {
    throw new Error('ADMIN_EMAIL is required for the admin area. Add it to .env.local.');
  }
  return email.trim().toLowerCase();
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.trim().toLowerCase() === adminEmail());
}

/**
 * A Supabase client bound to the request's cookies, so `getUser()` sees the
 * signed-in session and `signInWithOtp` / `verifyOtp` can persist one.
 *
 * `cookies()` is read-only inside Server Components; Next.js throws if you
 * write to it there. Swallowing that is the documented pattern — the session is
 * refreshed by `middleware.ts`, which *can* write.
 */
export async function createSessionClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.');
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — middleware handles the refresh.
        }
      },
    },
  });
}

/** The signed-in admin's email, or null. Never throws on a missing session. */
export async function currentAdminEmail(): Promise<string | null> {
  const supabase = await createSessionClient();
  // `getUser()` revalidates the JWT with Supabase. Do not swap this for
  // `getSession()`, which trusts a cookie the browser could have forged.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return isAdminEmail(user?.email) ? (user?.email ?? null) : null;
}

/**
 * Gate for admin pages and mutations. Redirects to the login page when the
 * caller is not the owner, so a Server Action can never run unguarded.
 */
export async function requireAdmin(): Promise<string> {
  const email = await currentAdminEmail();
  if (!email) redirect('/admin/login');
  return email;
}
