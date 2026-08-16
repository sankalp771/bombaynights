import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refreshes the admin's Supabase session cookie.
 *
 * Server Components cannot write cookies, so without this the access token
 * would expire after an hour and the owner would be bounced to the login screen
 * mid-moderation. This runs only on `/admin/*` — the public site has no session
 * at all and must not pay for a middleware hop.
 *
 * This is token *refresh*, not authorisation. Access is decided by
 * `requireAdmin()` on every page and every Server Action; middleware is the
 * wrong place for that check, because a matcher typo would silently open the
 * door.
 */
/** Shape `@supabase/ssr` hands back; it does not export this type. */
interface CookieToSet {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ['/admin/:path*'],
};
