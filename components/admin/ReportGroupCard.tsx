'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resolveReports, setPlaceStatus } from '@/app/admin/actions';
import { summariseHours } from '@/lib/submissionDiff';
import { formatDateTimeIst } from '@/lib/istTime';
import type { ReportGroup } from '@/lib/adminData';
import type { ReportReason } from '@/lib/types';

const REASON_LABELS: Record<ReportReason, string> = {
  closed_when_listed_open: 'Shut when we said open',
  wrong_hours: 'Timings wrong',
  shut_down: 'Place has shut down',
  osm_hours_drifted: 'OSM hours drifted (filed by the refresh job)',
  other: 'Something else',
};

/**
 * All reports for one place.
 *
 * Grouping is the point: three people saying "shut when you said open" is one
 * decision about one place, not three items to work through. The count is
 * shown because volume is the signal — a place with six open reports is almost
 * certainly wrong, whatever any single report says.
 */
export function ReportGroupCard({ group }: { group: ReportGroup }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const openReports = group.reports.filter((report) => !report.resolved_at);

  function act(action: () => Promise<{ ok: boolean; message?: string }>) {
    startTransition(async () => {
      const result = await action();
      setMessage(result.message ?? null);
      if (result.ok) router.refresh();
    });
  }

  return (
    <article className="border-night-edge bg-night-raised rounded-2xl border p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-cream text-lg font-bold">{group.place.name}</h3>
          <p className="text-cream-muted mt-0.5 text-xs">
            {group.place.status}
            {group.place.hours_verified ? ' · hours owner-verified' : ' · hours unverified'}
          </p>
          <p className="text-cream-muted mt-2 text-sm">{summariseHours(group.place.hours)}</p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {group.openCount > 0 ? (
            <span className="bg-neon/15 text-neon rounded-full px-2 py-0.5 text-xs font-semibold">
              {group.openCount} open
            </span>
          ) : null}
          <Link
            href={`/admin/places?q=${encodeURIComponent(group.place.name)}&status=all`}
            className="text-cream-muted text-xs underline underline-offset-4"
          >
            Edit
          </Link>
        </div>
      </header>

      <ul className="mt-3 flex flex-col gap-2">
        {group.reports.map((report) => (
          <li
            key={report.id}
            className={`rounded-lg px-3 py-2 text-sm ${
              report.resolved_at ? 'bg-night/60 text-cream-muted' : 'bg-night text-cream'
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{REASON_LABELS[report.reason] ?? report.reason}</span>
              <span className="text-cream-muted text-xs">
                {formatDateTimeIst(report.created_at)}
                {report.resolved_at ? ' · resolved' : ''}
              </span>
            </div>
            {report.detail ? (
              <p className="text-cream-muted mt-1 text-sm">{report.detail}</p>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        {openReports.length > 0 ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => resolveReports(openReports.map((report) => report.id)))}
            className="border-night-edge text-cream min-h-10 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50"
          >
            {pending ? 'Working…' : `Mark ${openReports.length} resolved`}
          </button>
        ) : null}

        {group.place.status !== 'archived' ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              act(async () => {
                const result = await setPlaceStatus(group.place.id, 'archived');
                if (result.ok && openReports.length > 0) {
                  await resolveReports(openReports.map((report) => report.id));
                }
                return result;
              })
            }
            className="border-neon text-neon min-h-10 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50"
            title="For a place that has actually shut down"
          >
            Archive place
          </button>
        ) : null}
      </div>

      {message ? <p className="text-cream-muted mt-3 text-sm">{message}</p> : null}
    </article>
  );
}
