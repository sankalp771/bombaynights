'use client';

import { useActionState, useState } from 'react';
import { sendLoginCode, verifyLoginCode, type ActionResult } from '@/app/admin/actions';

const IDLE: ActionResult = { ok: false };

/**
 * Two-step email OTP. The code is typed here rather than followed as a magic
 * link, because the owner moderates from a phone and a link opens a second
 * browser context that will not carry the session back.
 */
export function LoginForm() {
  const [email, setEmail] = useState('');
  const [codeSent, setCodeSent] = useState(false);

  const [sendState, sendAction, sending] = useActionState(
    async (prev: ActionResult, form: FormData) => {
      const result = await sendLoginCode(prev, form);
      if (result.ok) setCodeSent(true);
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
        </p>
      ) : null}

      {codeSent ? (
        <form
          action={verifyAction}
          className="border-night-edge mt-6 flex flex-col gap-3 border-t pt-5"
        >
          <input type="hidden" name="email" value={email} />
          <label className="text-cream text-sm font-medium" htmlFor="admin-code">
            6-digit code
          </label>
          <input
            id="admin-code"
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            className="border-night-edge bg-night text-cream focus:border-sodium min-h-12 rounded-xl border px-3 text-center font-mono text-2xl tracking-[0.4em] outline-none"
            placeholder="······"
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
