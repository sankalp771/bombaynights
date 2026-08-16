import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { getApprovedPlaces, getAreas } from '@/lib/data';
import { CATEGORIES, type Category } from '@/lib/types';
import { PlacesBrowser } from '@/components/PlacesBrowser';
import { Wordmark } from '@/components/Wordmark';

export const metadata: Metadata = {
  title: 'What’s open now',
  description:
    'Every place open late in Mumbai right now — filter by area and by what you feel like eating. Mira Road to Colaba.',
};

export const revalidate = 300;

export default async function PlacesPage() {
  const [places, areas] = await Promise.all([getApprovedPlaces(), getAreas()]);

  // Only offer tags that actually match something — a filter that always
  // returns nothing is worse than no filter.
  const present = new Set(places.flatMap((place) => place.categories));
  const availableTags = CATEGORIES.filter((category) => present.has(category)) as Category[];

  return (
    <main className="mx-auto max-w-3xl px-4 pt-6">
      <Link href="/" className="inline-block">
        <Wordmark as="span" />
      </Link>

      <Suspense fallback={<p className="text-cream-muted mt-6">Loading…</p>}>
        <div className="mt-4">
          <PlacesBrowser
            places={places}
            areas={areas}
            serverNow={Date.now()}
            availableTags={availableTags}
          />
        </div>
      </Suspense>
    </main>
  );
}
