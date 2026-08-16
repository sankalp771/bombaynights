import Link from 'next/link';
import { fetchReportGroups } from '@/lib/adminData';
import { ReportGroupCard } from '@/components/admin/ReportGroupCard';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show } = await searchParams;
  const includeResolved = show === 'all';
  const groups = await fetchReportGroups(includeResolved);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-bold">
          {includeResolved ? 'Every report' : 'Open reports'}
        </h2>
        <Link
          href={includeResolved ? '/admin/reports' : '/admin/reports?show=all'}
          className="text-cream-muted text-sm underline underline-offset-4"
        >
          {includeResolved ? 'Only open' : 'Show resolved too'}
        </Link>
      </div>

      {groups.length === 0 ? (
        <p className="border-night-edge bg-night-raised text-cream-muted rounded-2xl border p-6 text-center">
          {includeResolved ? 'Nobody has reported anything yet.' : 'No open reports. '}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {groups.map((group) => (
            <li key={group.place.id}>
              <ReportGroupCard group={group} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
