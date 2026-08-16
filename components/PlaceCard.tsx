import Link from 'next/link';
import { formatDistance } from '@/lib/geo';
import type { RankedPlace } from '@/lib/rank';
import { StatusLine } from './StatusLine';
import { FoodTypeMark, PriceBand, TagList, VerifiedBadge } from './Tags';

/**
 * One place, scannable in about a second by someone standing on a footpath with
 * one hand free. Order matters: status line first (it is why they are here),
 * then name, then the practical details.
 */
export function PlaceCard({
  entry,
  areaName,
}: {
  entry: RankedPlace;
  areaName: string | undefined;
}) {
  const { place, state, distanceMetres } = entry;
  const dimmed = state.kind === 'closed';

  return (
    <li
      className={`border-night-edge bg-night-raised rounded-xl border transition-colors ${
        dimmed ? 'opacity-65' : ''
      }`}
    >
      <Link
        href={`/place/${place.slug}`}
        // 44px+ touch target, whole card tappable — drunk-thumb test.
        className="hover:border-sodium/40 block rounded-xl p-4 focus-visible:outline-offset-4"
      >
        <StatusLine state={state} />

        <div className="mt-1.5 flex items-start justify-between gap-3">
          <h3 className="text-cream text-lg leading-snug font-semibold">
            <span className="mr-1.5 inline-block align-middle">
              <FoodTypeMark foodType={place.food_type} />
            </span>
            {place.name}
          </h3>
          {place.hours_verified ? <VerifiedBadge verifiedAt={place.verified_at} /> : null}
        </div>

        <p className="text-cream-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {areaName ? <span>{areaName}</span> : null}
          {distanceMetres !== null ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="tnum">{formatDistance(distanceMetres)}</span>
            </>
          ) : null}
          {place.price_band ? (
            <>
              <span aria-hidden="true">·</span>
              <PriceBand band={place.price_band} />
            </>
          ) : null}
        </p>

        {place.notes ? (
          <p className="text-cream/80 mt-2 text-sm leading-snug">{place.notes}</p>
        ) : null}

        {place.categories.length > 0 ? (
          <div className="mt-2.5">
            <TagList categories={place.categories} />
          </div>
        ) : null}
      </Link>
    </li>
  );
}
