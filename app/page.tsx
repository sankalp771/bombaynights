import Link from 'next/link';
import { getApprovedPlaces, getAreasWithCounts } from '@/lib/data';
import { CATEGORY_LABELS, FEATURED_CATEGORIES } from '@/lib/types';
import { Wordmark } from '@/components/Wordmark';
import { LiveHeadline } from '@/components/LiveHeadline';
import { ClosingLatestStrip } from '@/components/ClosingLatestStrip';
import { NearMeButton } from '@/components/NearMeButton';

export const revalidate = 300;

/**
 * The landing page is the answer, not a brochure (docs/04). Above the fold:
 * how many places are open this second, and two equal-weight ways in — near me,
 * or pick an area. Nothing here blocks on geolocation.
 */
export default async function HomePage() {
  const [places, areas] = await Promise.all([getApprovedPlaces(), getAreasWithCounts()]);
  const present = new Set(places.flatMap((place) => place.categories));
  const tags = FEATURED_CATEGORIES.filter((tag) => present.has(tag));

  return (
    <main className="mx-auto max-w-3xl px-4 pt-10 pb-4">
      <Wordmark />
      <p className="text-cream-muted mt-2 text-sm">
        Everything open between 12 AM and 6 AM. Mira Road to Colaba.
      </p>

      <div className="border-night-edge bg-night-raised mt-6 rounded-xl border p-5">
        <LiveHeadline places={places} serverNow={Date.now()} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <NearMeButton />
        <Link
          href="/places"
          className="border-night-edge hover:border-sodium/50 flex min-h-14 items-center justify-center rounded-xl border px-4 text-center font-semibold"
        >
          Browse everything
        </Link>
      </div>

      <section className="mt-10">
        <h2 className="text-cream-muted mb-3 text-sm font-semibold tracking-wide uppercase">
          By area · north to south
        </h2>
        <div className="flex flex-wrap gap-2">
          {areas.map((area) => (
            <Link
              key={area.slug}
              href={`/area/${area.slug}`}
              className={`border-night-edge hover:border-sodium/50 rounded-full border px-3.5 py-2 text-sm ${
                area.count === 0 ? 'text-cream-muted/60' : 'text-cream'
              }`}
            >
              {area.name}
              {area.count > 0 ? (
                <span className="text-cream-muted tnum ml-1.5 text-xs">{area.count}</span>
              ) : null}
            </Link>
          ))}
        </div>
      </section>

      <ClosingLatestStrip places={places} areas={areas} serverNow={Date.now()} />

      {tags.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-cream-muted mb-3 text-sm font-semibold tracking-wide uppercase">
            What do you feel like?
          </h2>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Link
                key={tag}
                href={`/places?tags=${tag}`}
                className="border-night-edge hover:border-neon/60 hover:text-cream text-cream-muted rounded-full border px-3.5 py-2 text-sm"
              >
                {CATEGORY_LABELS[tag]}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="border-night-edge mt-12 rounded-xl border border-dashed p-5">
        <h2 className="text-cream font-semibold">Know a spot we missed?</h2>
        <p className="text-cream-muted mt-1 text-sm">
          A dhaba, a car-dining corner, a lounge that just opened. No login, takes a minute.
        </p>
        <Link
          href="/submit"
          className="text-sodium mt-3 inline-block font-semibold underline underline-offset-4"
        >
          Add a place →
        </Link>
      </section>
    </main>
  );
}
