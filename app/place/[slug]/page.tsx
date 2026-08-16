import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getApprovedPlaces, getAreas, getPlaceBySlug } from '@/lib/data';
import { formatTime } from '@/lib/format';
import { LivePlaceStatus } from '@/components/LivePlaceStatus';
import { ReportButton } from '@/components/ReportButton';
import { FoodTypeMark, PriceBand, TagChip, VerifiedBadge } from '@/components/Tags';
import { WeekTable } from '@/components/WeekTable';
import { Wordmark } from '@/components/Wordmark';

export const revalidate = 300;

export async function generateStaticParams() {
  const places = await getApprovedPlaces();
  return places.map((place) => ({ slug: place.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const place = await getPlaceBySlug(slug);
  if (!place) return { title: 'Place not found' };

  const areas = await getAreas();
  const areaName = areas.find((area) => area.id === place.area_id)?.name;
  const description =
    place.notes ??
    `${place.name}${areaName ? ` in ${areaName}` : ''}, Mumbai — late-night timings, tags and directions.`;

  return {
    title: place.name,
    description,
    alternates: { canonical: `/place/${place.slug}` },
    openGraph: { title: `${place.name} · BombayNights`, description, url: `/place/${place.slug}` },
  };
}

export default async function PlacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [place, areas] = await Promise.all([getPlaceBySlug(slug), getAreas()]);
  if (!place) notFound();

  const area = areas.find((candidate) => candidate.id === place.area_id);
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;

  return (
    <main className="mx-auto max-w-3xl px-4 pt-6">
      <Link href="/" className="inline-block">
        <Wordmark as="span" />
      </Link>

      <nav className="text-cream-muted mt-4 text-sm">
        <Link href="/places" className="hover:text-cream">
          All places
        </Link>
        {area ? (
          <>
            {' / '}
            <Link href={`/area/${area.slug}`} className="hover:text-cream">
              {area.name}
            </Link>
          </>
        ) : null}
      </nav>

      <header className="mt-4">
        <LivePlaceStatus hours={place.hours} serverNow={Date.now()} />
        <h1 className="mt-2 text-3xl leading-tight font-extrabold">
          <span className="mr-2 inline-block align-middle">
            <FoodTypeMark foodType={place.food_type} />
          </span>
          {place.name}
        </h1>
        <p className="text-cream-muted mt-1 flex flex-wrap items-center gap-x-2 text-sm">
          {area ? <span>{area.name}</span> : null}
          {place.price_band ? (
            <>
              <span aria-hidden="true">·</span>
              <PriceBand band={place.price_band} />
            </>
          ) : null}
          {place.hours_verified ? (
            <>
              <span aria-hidden="true">·</span>
              <VerifiedBadge verifiedAt={place.verified_at} />
            </>
          ) : null}
        </p>
        {place.notes ? <p className="text-cream mt-3 leading-relaxed">{place.notes}</p> : null}
      </header>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <a
          href={directions}
          target="_blank"
          rel="noreferrer"
          className="bg-sodium text-night flex min-h-13 items-center justify-center rounded-xl px-4 py-3 font-semibold"
        >
          Get directions
        </a>
        {place.phone ? (
          <a
            href={`tel:${place.phone.replace(/[^+\d]/g, '')}`}
            className="border-night-edge hover:border-sodium/50 flex min-h-13 items-center justify-center rounded-xl border px-4 py-3 font-semibold"
          >
            Call {place.phone}
          </a>
        ) : null}
      </div>

      {place.address ? (
        <p className="text-cream-muted mt-4 text-sm leading-relaxed">{place.address}</p>
      ) : null}

      <section className="mt-8">
        <h2 className="text-cream-muted mb-2 text-sm font-semibold tracking-wide uppercase">
          Hours
        </h2>
        {place.hours ? (
          <WeekTable hours={place.hours} serverNow={Date.now()} />
        ) : (
          <p className="border-night-edge text-cream-muted rounded-xl border border-dashed p-4 text-sm">
            We don’t have confirmed timings for this one yet, so we won’t guess. If you know them,{' '}
            <Link href={`/submit?correction=${place.slug}`} className="text-sodium underline">
              tell us
            </Link>
            .
          </p>
        )}
        {place.last_call ? (
          <p className="text-cream-muted mt-2 text-sm">
            Last call for drinks around{' '}
            <span className="text-cream tnum">{formatTime(place.last_call.slice(0, 5))}</span>.
          </p>
        ) : null}
      </section>

      {place.categories.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-cream-muted mb-2 text-sm font-semibold tracking-wide uppercase">
            Tags
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {place.categories.map((category) => (
              <Link key={category} href={`/places?tags=${category}&open=all`}>
                <TagChip category={category} />
              </Link>
            ))}
          </div>
          <dl className="text-cream-muted mt-4 grid grid-cols-2 gap-y-2 text-sm">
            <Fact label="Alcohol" value={triState(place.serves_alcohol)} />
            <Fact label="Shisha" value={triState(place.has_shisha)} />
            {place.service_modes.length > 0 ? (
              <Fact
                label="Service"
                value={place.service_modes.map((mode) => SERVICE_LABELS[mode] ?? mode).join(', ')}
              />
            ) : null}
          </dl>
        </section>
      ) : null}

      <section className="border-night-edge mt-10 border-t pt-6">
        <h2 className="text-cream font-semibold">Something wrong?</h2>
        <p className="text-cream-muted mt-1 text-sm">
          Timings change, places shut. Telling us takes one tap and keeps the badge meaningful.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <ReportButton placeId={place.id} placeName={place.name} />
          <Link
            href={`/submit?correction=${place.slug}`}
            className="border-night-edge hover:border-sodium/50 flex min-h-11 items-center rounded-lg border px-4 text-sm font-semibold"
          >
            Suggest an edit
          </Link>
        </div>
      </section>
    </main>
  );
}

const SERVICE_LABELS: Record<string, string> = {
  dine_in: 'Dine-in',
  takeaway: 'Takeaway',
  car_dining: 'Car dining',
  delivery_only: 'Delivery only',
};

function triState(value: boolean | null): string {
  if (value === null) return 'Not known';
  return value ? 'Yes' : 'No';
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className="text-cream">{value}</dd>
    </>
  );
}
