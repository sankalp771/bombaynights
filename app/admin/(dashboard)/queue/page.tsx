import Link from 'next/link';
import { fetchAdminAreas, fetchPlaces, fetchSubmissions } from '@/lib/adminData';
import { SubmissionCard } from '@/components/admin/SubmissionCard';
import type { Place } from '@/lib/types';

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show } = await searchParams;
  const includeAll = show === 'all';

  const [submissions, areas] = await Promise.all([
    fetchSubmissions(includeAll ? 'all' : 'pending'),
    fetchAdminAreas(),
  ]);

  // Corrections are shown side by side with what is stored, so the owner can
  // see what actually changed instead of re-reading the whole record.
  const correctionTargets = submissions
    .filter((submission) => submission.kind === 'correction' && submission.place_id)
    .map((submission) => submission.place_id as string);

  const targets = new Map<string, Place>();
  if (correctionTargets.length > 0) {
    const places = await fetchPlaces();
    for (const place of places) {
      if (correctionTargets.includes(place.id)) targets.set(place.id, place);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-bold">
          {includeAll ? 'Every submission' : 'Waiting on you'}
        </h2>
        <Link
          href={includeAll ? '/admin/queue' : '/admin/queue?show=all'}
          className="text-cream-muted text-sm underline underline-offset-4"
        >
          {includeAll ? 'Only pending' : 'Show decided too'}
        </Link>
      </div>

      {submissions.length === 0 ? (
        <p className="border-night-edge bg-night-raised text-cream-muted rounded-2xl border p-6 text-center">
          {includeAll
            ? 'Nothing has been submitted yet.'
            : 'Queue is clear. Nothing waiting on you.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {submissions.map((submission) => (
            <li key={submission.id}>
              <SubmissionCard
                submission={submission}
                areas={areas}
                target={submission.place_id ? (targets.get(submission.place_id) ?? null) : null}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
