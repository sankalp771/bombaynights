import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { getApprovedPlaces, getAreas } from '@/lib/data';
import { CATEGORIES, type Category } from '@/lib/types';
import { PlacesBrowser } from '@/components/PlacesBrowser';
import { Wordmark } from '@/components/Wordmark';

export const revalidate = 300;

export async function generateStaticParams() {
  const areas = await getAreas();
  return areas.map((area) => ({ slug: area.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const area = (await getAreas()).find((candidate) => candidate.slug === slug);
  if (!area) return { title: 'Area not found' };

  return {
    title: `Late-night food in ${area.name}`,
    description:
      area.intro ??
      `Restaurants, bars and street food open after midnight in ${area.name}, Mumbai. Verified timings.`,
    alternates: { canonical: `/area/${area.slug}` },
    openGraph: {
      title: `Late-night food in ${area.name} · BombayNights`,
      description: area.intro ?? undefined,
      url: `/area/${area.slug}`,
    },
  };
}

export default async function AreaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [places, areas] = await Promise.all([getApprovedPlaces(), getAreas()]);
  const area = areas.find((candidate) => candidate.slug === slug);
  if (!area) notFound();

  const inArea = places.filter((place) => place.area_id === area.id);
  const present = new Set(inArea.flatMap((place) => place.categories));
  const availableTags = CATEGORIES.filter((category) => present.has(category)) as Category[];

  return (
    <main className="mx-auto max-w-3xl px-4 pt-6">
      <Link href="/" className="inline-block">
        <Wordmark as="span" />
      </Link>

      <h1 className="mt-5 text-3xl leading-tight font-extrabold">
        Late-night food in <span className="text-sodium">{area.name}</span>
      </h1>
      {area.intro ? (
        <p className="text-cream-muted mt-2 max-w-prose leading-relaxed">{area.intro}</p>
      ) : null}

      <Suspense fallback={<p className="text-cream-muted mt-6">Loading…</p>}>
        <div className="mt-5">
          <PlacesBrowser
            places={places}
            areas={areas}
            serverNow={Date.now()}
            availableTags={availableTags}
            lockedAreaId={area.id}
          />
        </div>
      </Suspense>

      <nav className="border-night-edge mt-10 border-t pt-6">
        <h2 className="text-cream-muted mb-3 text-sm font-semibold">Other areas</h2>
        <div className="flex flex-wrap gap-2">
          {areas
            .filter((candidate) => candidate.slug !== area.slug)
            .map((candidate) => (
              <Link
                key={candidate.slug}
                href={`/area/${candidate.slug}`}
                className="border-night-edge text-cream-muted hover:text-cream rounded-full border px-3 py-1.5 text-sm"
              >
                {candidate.name}
              </Link>
            ))}
        </div>
      </nav>
    </main>
  );
}
