'use client';

import { useState } from 'react';
import { VISITOR_REPORT_REASONS, type ReportReason } from '@/lib/types';

/**
 * One tap to say "this was shut". Deliberately a tiny inline panel rather than
 * a modal — someone standing outside a closed shutter should not have to
 * navigate anywhere.
 */
export function ReportButton({ placeId, placeName }: { placeId: string; placeName: string }) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState<ReportReason | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState('');

  async function send(reason: ReportReason) {
    setSending(reason);
    setError(null);
    try {
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ place_id: placeId, reason, website: honeypot }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? 'Could not send that.');
        return;
      }
      setDone(true);
    } catch {
      setError('No connection. Try again when you have signal.');
    } finally {
      setSending(null);
    }
  }

  if (done) {
    return (
      <p className="text-open text-sm font-semibold">
        Thanks — we’ll check {placeName} and fix it.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-neon/40 text-neon hover:border-neon flex min-h-11 items-center rounded-lg border px-4 text-sm font-semibold"
      >
        Report wrong timing
      </button>
    );
  }

  return (
    <div className="border-night-edge bg-night-raised w-full rounded-xl border p-4">
      <p className="text-cream text-sm font-semibold">What happened?</p>
      <div className="mt-3 flex flex-col gap-2">
        {VISITOR_REPORT_REASONS.map((reason) => (
          <button
            key={reason.value}
            type="button"
            disabled={sending !== null}
            onClick={() => void send(reason.value)}
            className="border-night-edge hover:border-sodium/60 text-cream min-h-11 rounded-lg border px-3 text-left text-sm disabled:opacity-50"
          >
            {sending === reason.value ? 'Sending…' : reason.label}
          </button>
        ))}
      </div>

      {/* Honeypot: hidden from people, irresistible to bots. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={honeypot}
        onChange={(event) => setHoneypot(event.target.value)}
        className="absolute h-0 w-0 opacity-0"
      />

      {error ? <p className="text-neon mt-3 text-sm">{error}</p> : null}

      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-cream-muted hover:text-cream mt-3 text-sm underline underline-offset-4"
      >
        Cancel
      </button>
    </div>
  );
}
