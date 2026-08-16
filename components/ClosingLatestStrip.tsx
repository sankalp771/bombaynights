'use client';

import Link from 'next/link';
import { closingLatest } from '@/lib/rank';
import { useNow } from '@/lib/useNow';
import { formatTime } from '@/lib/format';
import { useMemo } from 'react';
import type { Area, PublicPlace } from '@/lib/types';

/**
 * "Still going latest tonight" — the answer to the second question people ask
 * after "what's open?", which is "what will still be open by the time we get
 * there?".
 */
export function ClosingLatestStrip({
  places,
  areas,
  serverNow,
}: {
  places: PublicPlace[];
  areas: Area[];
  serverNow: number;
}) {
  const now = useNow(serverNow);
  const areaById = useMemo(() => new Map(areas.map((area) => [area.id, area])), [areas]);
  const strip = closingLatest(places, now, 6);

  if (strip.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-cream-muted mb-3 text-sm font-semibold tracking-wide uppercase">
        Still going latest tonight
      </h2>
      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <ul className="flex w-max gap-3">
          {strip.map((entry) => (
            <li key={entry.place.id}>
              <Link
                href={`/place/${entry.place.slug}`}
                className="border-night-edge bg-night-raised hover:border-sodium/40 flex h-full w-56 flex-col rounded-xl border p-4"
              >
                <span className="neon-open font-display tnum text-sm font-bold">
                  {entry.state.kind === 'open'
                    ? `TILL ${formatTime(entry.state.closesAt).toUpperCase()}`
                    : 'OPEN 24×7'}
                </span>
                <span className="text-cream mt-1.5 leading-snug font-semibold">
                  {entry.place.name}
                </span>
                <span className="text-cream-muted mt-0.5 text-sm">
                  {entry.place.area_id ? areaById.get(entry.place.area_id)?.name : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
