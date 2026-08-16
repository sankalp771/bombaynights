import { NextResponse, type NextRequest } from 'next/server';
import { createSessionClient, isAdminEmail } from '@/lib/adminAuth';

/**
 * Exchanges a Supabase magic-link code for a session.
 *
 * `signInWithOtp` sends exactly one email, and whether it carries a 6-digit
 * token or a clickable link is decided entirely by the project's email
 * template. The login form drives the token path (`verifyOtp`), but a project
 * left on Supabase's default template sends `{{ .ConfirmationURL }}` — a link.
 * Following it lands the owner back on the site with `?code=…` in the URL and,
 * without this route, nothing to consume it: no session, no admin, no error.
 * That is the bug this route closes. Both paths now end in the same place.
 *
 * A route handler is the correct home for it: unlike a Server Component it can
 * write cookies, so the exchanged session actually persists.
 */

export const dynamic = 'force-dynamic';

function failure(request: NextRequest, reason: string): NextResponse {
  const url = new URL('/admin/login', request.url);
  url.searchParams.set('error', reason);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get('code');

  // Supabase reports its own refusals (expired or already-used link) here.
  const providerError = request.nextUrl.searchParams.get('error_description');
  if (providerError) return failure(request, 'link-rejected');

  if (!code) return failure(request, 'no-code');

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    /*
     * Most often this is PKCE: the code verifier is a cookie set when the code
     * was requested, so a link opened on a different device or browser than the
     * one that asked for it cannot complete. Nothing is wrong with the link —
     * it has to finish where it started.
     */
    return failure(request, 'exchange-failed');
  }

  /*
   * Belt and suspenders. `sendLoginCode` refuses non-admin addresses, but a
   * valid session for this project is not the same as permission — any address
   * Supabase accepts would arrive here `authenticated`. Access is the email
   * matching ADMIN_EMAIL, checked here as it is on every other admin request.
   * Tear down the session rather than leaving a stranger holding a live one.
   */
  if (!isAdminEmail(data.user?.email)) {
    await supabase.auth.signOut();
    return failure(request, 'not-admin');
  }

  return NextResponse.redirect(new URL('/admin/queue', request.url));
}
