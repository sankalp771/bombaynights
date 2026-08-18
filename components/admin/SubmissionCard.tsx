'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { approveSubmission, rejectSubmission } from '@/app/admin/actions';
import { diffSubmission, summariseHours } from '@/lib/submissionDiff';
import { formatDateTimeIst } from '@/lib/istTime';
import { googleMapsSearchUrl } from '@/lib/maps';
import type { Area, Place, SubmissionRow } from '@/lib/types';

/**
 * One item in the moderation queue.
 *
 * A correction leads with a "was → now" diff, because that is the decision:
 * everything else on the record is unchanged and re-reading it wastes the one
 * scarce resource here, which is the owner's attention at 2 AM.
 *
 * Verification is the address link: it opens the place's Google Maps card
 * (live hours, "Permanently closed", photos) and the owner judges from there.
 * No coordinates appear anywhere — visitors submit an address, and a place
 * without a pin simply stays off the map until OSM or a seeder supplies one.
 */
export function SubmissionCard({
  submission,
  areas,
  target,
}: {
  submission: SubmissionRow;
  areas: Area[];
  target: Place | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [areaId, setAreaId] = useState<string>('');

  const payload = submission.payload;
  const isCorrection = submission.kind === 'correction' && target;
  const diffs = isCorrection ? diffSubmission(target, payload) : [];
  const decided = submission.status !== 'pending';

  const area = areas.find((candidate) => candidate.slug === payload.area_slug);
  const needsArea = !isCorrection && !area;

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome.message ?? (outcome.ok ? 'Done.' : 'That did not work.'));
    });
  }

  return (
    <article className="border-night-edge bg-night-raised rounded-2xl border p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-cream text-lg font-bold">
            {payload.name || target?.name || 'Untitled'}
          </h3>
          <p className="text-cream-muted mt-0.5 text-xs">
            {isCorrection ? 'Correction' : 'New place'} · {formatDateTimeIst(submission.created_at)}
            {area ? ` · ${area.name}` : ''}
          </p>
        </div>

        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            submission.status === 'pending'
              ? 'bg-sodium/15 text-sodium'
              : submission.status === 'approved'
                ? 'bg-open/15 text-open'
                : 'bg-night-edge text-cream-muted'
          }`}
        >
          {submission.status}
        </span>
      </header>

      {/* Credit, when the contributor chose to leave it. */}
      {payload.submitter_name || payload.submitter_contact ? (
        <p className="bg-night text-cream-muted mt-3 rounded-lg px-3 py-2 text-xs">
          From <span className="text-cream">{payload.submitter_name || 'someone'}</span>
          {payload.submitter_contact ? ` · ${payload.submitter_contact}` : ''}
        </p>
      ) : null}

      {isCorrection ? (
        diffs.length === 0 ? (
          <p className="text-cream-muted mt-3 text-sm">
            Nothing in this correction differs from what is stored.
          </p>
        ) : (
          <dl className="mt-3 flex flex-col gap-2">
            {diffs.map((diff) => (
              <div key={diff.field} className="bg-night rounded-lg px-3 py-2 text-sm">
                <dt className="text-cream-muted text-xs font-semibold tracking-wide uppercase">
                  {diff.label}
                </dt>
                <dd className="mt-1 flex flex-wrap items-baseline gap-2">
                  <span className="text-cream-muted decoration-neon/60 line-through">
                    {diff.before}
                  </span>
                  <span aria-hidden>→</span>
                  <span className="text-cream">{diff.after}</span>
                </dd>
              </div>
            ))}
          </dl>
        )
      ) : (
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Detail
              label="Address"
              value={
                payload.address ? (
                  <a
                    href={googleMapsSearchUrl(
                      [payload.name, payload.address].filter(Boolean).join(', '),
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-4"
                  >
                    {payload.address}
                  </a>
                ) : (
                  '—'
                )
              }
            />
          </div>
          <Detail label="Tags" value={(payload.categories ?? []).join(', ') || '—'} />
          <Detail label="Food" value={payload.food_type ?? 'unknown'} />
          <Detail label="Phone" value={payload.phone || '—'} />
          <Detail label="Photo" value={payload.photo_url || '—'} />
          <div className="sm:col-span-2">
            <Detail label="Hours" value={summariseHours(payload.hours)} />
          </div>
          {payload.notes ? (
            <div className="sm:col-span-2">
              <Detail label="Notes" value={payload.notes} />
            </div>
          ) : null}
        </dl>
      )}

      {needsArea ? (
        <label className="mt-3 flex flex-col gap-1 text-sm">
          <span className="text-cream-muted">No area matched — pick one before approving</span>
          <select
            value={areaId}
            onChange={(event) => setAreaId(event.target.value)}
            className="border-night-edge bg-night text-cream min-h-11 rounded-xl border px-3"
          >
            <option value="">Choose an area…</option>
            {areas.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {!decided ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || (needsArea && !areaId)}
            onClick={() =>
              run(() => approveSubmission(submission.id, areaId ? { area_id: Number(areaId) } : {}))
            }
            className="bg-open text-night min-h-11 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
          >
            {pending ? 'Working…' : 'Approve'}
          </button>

          <button
            type="button"
            disabled={pending}
            onClick={() => setRejecting((open) => !open)}
            className="border-night-edge text-cream-muted min-h-11 rounded-xl border px-4 text-sm font-semibold"
          >
            Reject
          </button>
        </div>
      ) : submission.admin_note ? (
        <p className="text-cream-muted mt-3 text-sm">Note: {submission.admin_note}</p>
      ) : null}

      {rejecting && !decided ? (
        <div className="mt-3 flex flex-col gap-2">
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Why? (optional, for your own records)"
            className="border-night-edge bg-night text-cream min-h-11 rounded-xl border px-3 text-sm"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => rejectSubmission(submission.id, note))}
            className="border-neon text-neon min-h-11 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50"
          >
            Confirm reject
          </button>
        </div>
      ) : null}

      {result ? <p className="text-cream-muted mt-3 text-sm">{result}</p> : null}
    </article>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-cream-muted text-xs font-semibold tracking-wide uppercase">{label}</dt>
      <dd className="text-cream mt-0.5 break-words">{value}</dd>
    </div>
  );
}
