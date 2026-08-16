import Link from 'next/link';
import { requireAdmin } from '@/lib/adminAuth';
import { fetchQueueCounts } from '@/lib/adminData';
import { signOut } from '@/app/admin/actions';
import { AdminTabs } from '@/components/admin/AdminTabs';

/**
 * The signed-in shell.
 *
 * `requireAdmin()` here is convenience, not security — it keeps every page from
 * repeating the redirect. The real enforcement is that each function in
 * `lib/adminData.ts` and every Server Action checks for itself, because a
 * layout does not run before a Server Action invoked from a client component.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const email = await requireAdmin();
  const counts = await fetchQueueCounts();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold">
            <span className="text-cream">Bombay</span>
            <span className="text-sodium">Nights</span>
            <span className="text-cream-muted ml-2 align-middle text-base font-semibold">
              admin
            </span>
          </h1>
          <p className="text-cream-muted mt-1 text-xs">{email}</p>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <Link href="/places" className="text-cream-muted underline underline-offset-4">
            View site
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-cream-muted underline underline-offset-4">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <AdminTabs counts={counts} />

      {children}
    </div>
  );
}
