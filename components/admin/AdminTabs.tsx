'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { QueueCounts } from '@/lib/adminData';

const TABS = [
  { href: '/admin/queue', label: 'Queue', badge: (c: QueueCounts) => c.pendingSubmissions },
  { href: '/admin/places', label: 'Places', badge: (c: QueueCounts) => c.pendingPlaces },
  { href: '/admin/reports', label: 'Reports', badge: (c: QueueCounts) => c.openReports },
] as const;

export function AdminTabs({ counts }: { counts: QueueCounts }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-2 overflow-x-auto" aria-label="Admin sections">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        const badge = tab.badge(counts);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors ${
              active
                ? 'border-sodium bg-sodium/10 text-sodium'
                : 'border-night-edge text-cream-muted hover:text-cream'
            }`}
          >
            {tab.label}
            {badge > 0 ? (
              <span
                className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${
                  active ? 'bg-sodium text-night' : 'bg-night-edge text-cream'
                }`}
              >
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
