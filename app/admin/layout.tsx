import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin',
  // Belt and braces with robots.ts: the moderation queue must never be indexed.
  robots: { index: false, follow: false, nocache: true },
};

/** Admin pages are always rendered fresh — a cached queue is a wrong queue. */
export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-24">{children}</div>;
}
