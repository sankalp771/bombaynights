import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { getAreas } from '@/lib/data';
import { SubmitForm } from '@/components/SubmitForm';
import { Wordmark } from '@/components/Wordmark';

export const metadata: Metadata = {
  title: 'Add a place',
  description:
    'Know a late-night spot in Mumbai we’ve missed? Add it — no login, no email, takes a minute.',
  alternates: { canonical: '/submit' },
};

export default async function SubmitPage() {
  const areas = await getAreas();

  return (
    <main className="mx-auto max-w-2xl px-4 pt-6">
      <Link href="/" className="inline-block">
        <Wordmark as="span" />
      </Link>

      <h1 className="mt-5 text-3xl leading-tight font-extrabold">Know a spot we missed?</h1>
      <p className="text-cream-muted mt-2 leading-relaxed">
        A galli joint, a car-dining corner, a lounge that just opened — the more obscure, the more
        useful. No login, no email.
      </p>

      <Suspense fallback={<p className="text-cream-muted mt-6">Loading…</p>}>
        <SubmitForm areas={areas} />
      </Suspense>
    </main>
  );
}
