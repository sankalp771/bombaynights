'use client';

import { useActionState, useState } from 'react';
import { sendLoginCode, verifyLoginCode, type ActionResult } from '@/app/admin/actions';

const IDLE: ActionResult = { ok: false };

/**
 * Two-step email OTP. The code is typed here rather than followed as a magic
 * link, because the owner moderates from a phone and a link opens a second
 * browser context that will not carry the session back.
 *
 * The code box opens after *any* send attempt, not only a successful one, and
 * there is a manual way in besides. Supabase's built-in mailer allows two
 * emails an hour: ask twice because the first was slow, and a strict
 * "only on success" rule would hide the box just as the code lands in the
 * inbox — locking the owner out of their own admin for an hour with a valid
 * code in hand.
 */
export function LoginForm() {
  const [email, setEmail] = useState('');
  const [codeSent, setCodeSent] = useState(false);

  const [sendState, sendAction, sending] = useActionState(
    async (prev: ActionResult, form: FormData) => {
      const result = await sendLoginCode(prev, form);
      setCodeSent(true);
      return result;
    },
    IDLE,
  );

  const [verifyState, verifyAction, verifying] = useActionState(verifyLoginCode, IDLE);

  return (
    <div className="border-night-edge bg-night-raised rounded-2xl border p-5">
      <form action={sendAction} className="flex flex-col gap-3">
        <label className="text-cream text-sm font-medium" htmlFor="admin-email">
          Admin email
        </label>
        <input
          id="admin-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="border-night-edge bg-night text-cream focus:border-sodium min-h-12 rounded-xl border px-3 outline-none"
          placeholder="you@example.com"
        />
        <button
          type="submit"
          disabled={sending}
          className="bg-sodium text-night min-h-12 rounded-xl px-4 font-semibold disabled:opacity-60"
        >
          {sending ? 'Sending…' : codeSent ? 'Send another code' : 'Send code'}
        </button>
      </form>

      {sendState.message ? (
        <p className={`mt-3 text-sm ${sendState.ok ? 'text-cream-muted' : 'text-neon'}`}>
          {sendState.message}
          {/* Two emails an hour is the built-in limit; say so instead of leaving
              the owner guessing why nothing arrived. */}
          {!sendState.ok && /rate limit/i.test(sendState.message) ? (
            <span className="text-cream-muted mt-1 block">
              Supabase sends at most two of these an hour. If a code already reached you, it is
              still good for an hour — enter it below.
            </span>
          ) : null}
        </p>
      ) : null}

      {!codeSent ? (
        <button
          type="button"
          onClick={() => setCodeSent(true)}
          className="text-cream-muted mt-3 text-sm underline underline-offset-4"
        >
          I already have a code
        </button>
      ) : null}

      {codeSent ? (
        <form
          action={verifyAction}
          className="border-night-edge mt-6 flex flex-col gap-3 border-t pt-5"
        >
          <input type="hidden" name="email" value={email} />
          <label className="text-cream text-sm font-medium" htmlFor="admin-code">
            Code from the email
          </label>
          {/*
           * Not pinned to a length: Supabase's OTP length is a project setting
           * (6 by default, 8 here) that can change in the dashboard without a
           * deploy. A hard-coded `\d{6}` would lock the owner out silently.
           */}
          <input
            id="admin-code"
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6,10}"
            maxLength={10}
            required
            className="border-night-edge bg-night text-cream focus:border-sodium min-h-12 rounded-xl border px-3 text-center font-mono text-2xl tracking-[0.3em] outline-none"
            placeholder="••••••"
          />
          <button
            type="submit"
            disabled={verifying}
            className="border-sodium text-sodium min-h-12 rounded-xl border px-4 font-semibold disabled:opacity-60"
          >
            {verifying ? 'Checking…' : 'Sign in'}
          </button>
        </form>
      ) : null}

      {verifyState.message ? <p className="text-neon mt-3 text-sm">{verifyState.message}</p> : null}
    </div>
  );
}
