import { redirect } from 'next/navigation';
import { currentAdminEmail } from '@/lib/adminAuth';
import { LoginForm } from '@/components/admin/LoginForm';
import { Wordmark } from '@/components/Wordmark';

/**
 * Reasons `/auth/callback` bounces someone back here. A failed magic link used
 * to end on the landing page with a `?code=` in the URL and no explanation at
 * all, which reads as "the site is broken" rather than "that link is spent".
 */
const CALLBACK_ERRORS: Record<string, string> = {
  'link-rejected': 'That sign-in link has expired or was already used. Send a fresh one.',
  'no-code': 'That sign-in link was incomplete. Send a fresh one.',
  'exchange-failed':
    'That link has to be opened in the same browser that asked for it. Easier: request a code below and type it in.',
  'not-admin': 'That account is not the owner.',
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await currentAdminEmail()) redirect('/admin/queue');

  const { error } = await searchParams;
  const errorMessage = error ? (CALLBACK_ERRORS[error] ?? 'That sign-in link did not work.') : null;

  return (
    <main className="mx-auto flex min-h-[70dvh] w-full max-w-sm flex-col justify-center gap-8">
      <div className="text-center">
        <Wordmark />
        <p className="text-cream-muted mt-3 text-sm">
          Owner access only. Everyone else browses and submits without an account — that is the
          whole point.
        </p>
      </div>

      {errorMessage ? (
        <p
          role="alert"
          className="border-neon/40 text-neon rounded-xl border px-4 py-3 text-center text-sm"
        >
          {errorMessage}
        </p>
      ) : null}

      <LoginForm />
    </main>
  );
}
