'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { rankPlaces } from '@/lib/rank';
import { useGeolocation } from '@/lib/useGeolocation';
import { useNow } from '@/lib/useNow';
import { CATEGORY_LABELS, type Area, type Category, type PublicPlace } from '@/lib/types';
import { PlaceCard } from './PlaceCard';

/**
 * The core screen. All state lives in the URL so any view is shareable —
 * `/places?area=bandra&tags=shisha_lounge,bar&open=all` is a link you can send
 * to the group chat, which is exactly how people decide where to go.
 *
 * Everything below re-computes from `now`, which ticks in the browser. The
 * server sent facts; the judgement ("open?") is made here, fresh, every time.
 */

// Leaflet is ~40 KB and most visitors never open the map, so it loads only on
// demand — the list must stay fast on one bar of network.
const MapView = dynamic(() => import('./MapView').then((module) => module.MapView), {
  ssr: false,
  loading: () => (
    <div className="border-night-edge bg-night-raised text-cream-muted flex h-[60vh] items-center justify-center rounded-xl border text-sm">
      Loading map…
    </div>
  ),
});

export function PlacesBrowser({
  places,
  areas,
  serverNow,
  availableTags,
  lockedAreaId,
}: {
  places: PublicPlace[];
  areas: Area[];
  serverNow: number;
  availableTags: Category[];
  /** Set on /area/[slug], where the area is part of the page, not a filter. */
  lockedAreaId?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const now = useNow(serverNow);
  const geo = useGeolocation();
  const [view, setView] = useState<'list' | 'map'>('list');

  const areaBySlug = useMemo(() => new Map(areas.map((area) => [area.slug, area])), [areas]);
  const areaById = useMemo(() => new Map(areas.map((area) => [area.id, area])), [areas]);

  const openOnly = params.get('open') !== 'all';
  const activeTags = useMemo(() => (params.get('tags') ?? '').split(',').filter(Boolean), [params]);
  const areaId = lockedAreaId ?? areaBySlug.get(params.get('area') ?? '')?.id ?? null;

  // Arriving from "Near me" on the landing page: permission was already granted
  // there, so this resolves without a second prompt.
  const autoLocated = useRef(false);
  const wantsNear = params.get('near') === '1';
  useEffect(() => {
    if (wantsNear && !autoLocated.current) {
      autoLocated.current = true;
      geo.locate();
    }
  }, [wantsNear, geo]);

  const setParams = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const toggleTag = useCallback(
    (tag: string) => {
      const next = activeTags.includes(tag)
        ? activeTags.filter((value) => value !== tag)
        : [...activeTags, tag];
      setParams({ tags: next.length > 0 ? next.join(',') : null });
    },
    [activeTags, setParams],
  );

  const ranked = useMemo(
    () =>
      rankPlaces(places, {
        now,
        origin: geo.position,
        openOnly,
        areaId,
        tags: activeTags,
      }),
    [places, now, geo.position, openOnly, areaId, activeTags],
  );

  // For the empty state: where SHOULD they go instead?
  const fallback = useMemo(() => {
    if (ranked.length > 0 || areaId === null) return null;
    const elsewhere = rankPlaces(places, { now, openOnly, tags: activeTags });
    const firstArea = elsewhere.find((entry) => entry.place.area_id !== areaId)?.place.area_id;
    if (firstArea === undefined || firstArea === null) return null;
    const area = areaById.get(firstArea);
    if (!area) return null;
    return {
      area,
      count: elsewhere.filter((entry) => entry.place.area_id === firstArea).length,
    };
  }, [ranked.length, areaId, places, now, openOnly, activeTags, areaById]);

  const currentAreaName = areaId !== null ? areaById.get(areaId)?.name : undefined;

  return (
    <div>
      {/* Filters stay reachable one-handed while scrolling a long list. */}
      <div className="bg-night/90 border-night-edge sticky top-0 z-20 -mx-4 mb-4 border-b px-4 pt-3 pb-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setParams({ open: openOnly ? 'all' : null })}
            aria-pressed={openOnly}
            className={`min-h-11 rounded-full px-4 text-sm font-semibold transition-colors ${
              openOnly
                ? 'bg-open text-night'
                : 'border-night-edge text-cream-muted hover:text-cream border'
            }`}
          >
            {openOnly ? 'Open now' : 'All late-night'}
          </button>

          <button
            type="button"
            onClick={() => (geo.position ? geo.clear() : geo.locate())}
            aria-pressed={Boolean(geo.position)}
            className={`min-h-11 rounded-full px-4 text-sm font-semibold transition-colors ${
              geo.position
                ? 'bg-sodium text-night'
                : 'border-night-edge text-cream-muted hover:text-cream border'
            }`}
          >
            {geo.status === 'locating' ? 'Finding you…' : geo.position ? 'Near me ✓' : 'Near me'}
          </button>

          <button
            type="button"
            onClick={() => setView(view === 'list' ? 'map' : 'list')}
            className="border-night-edge text-cream-muted hover:text-cream ml-auto min-h-11 rounded-full border px-4 text-sm font-semibold"
          >
            {view === 'list' ? 'Map' : 'List'}
          </button>
        </div>

        {geo.status === 'denied' || geo.status === 'unavailable' ? (
          <p className="text-cream-muted mt-2 text-xs">
            No location — no problem. Pick an area below instead.
          </p>
        ) : null}

        {!lockedAreaId ? (
          <div className="-mx-4 mt-3 overflow-x-auto px-4 pb-1">
            <div className="flex w-max gap-2">
              <Chip
                label="All areas"
                active={areaId === null}
                onClick={() => setParams({ area: null })}
              />
              {areas.map((area) => (
                <Chip
                  key={area.slug}
                  label={area.name}
                  active={areaById.get(areaId ?? -1)?.slug === area.slug}
                  onClick={() =>
                    setParams({
                      area: areaById.get(areaId ?? -1)?.slug === area.slug ? null : area.slug,
                    })
                  }
                />
              ))}
            </div>
          </div>
        ) : null}

        {availableTags.length > 0 ? (
          <div className="-mx-4 mt-2 overflow-x-auto px-4 pb-1">
            <div className="flex w-max gap-2">
              {activeTags.length > 0 ? (
                <Chip label="Clear" active={false} onClick={() => setParams({ tags: null })} />
              ) : null}
              {availableTags.map((tag) => (
                <Chip
                  key={tag}
                  label={CATEGORY_LABELS[tag] ?? tag}
                  active={activeTags.includes(tag)}
                  onClick={() => toggleTag(tag)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <p className="text-cream-muted mb-3 text-sm">
        <span className="text-cream tnum font-semibold">{ranked.length}</span>{' '}
        {ranked.length === 1 ? 'place' : 'places'}
        {openOnly ? ' open right now' : ' that run late'}
        {currentAreaName ? ` in ${currentAreaName}` : ''}
      </p>

      {view === 'map' ? (
        <MapView entries={ranked} areaById={areaById} />
      ) : ranked.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {ranked.map((entry) => (
            <PlaceCard
              key={entry.place.id}
              entry={entry}
              areaName={entry.place.area_id ? areaById.get(entry.place.area_id)?.name : undefined}
            />
          ))}
        </ul>
      ) : (
        <div className="border-night-edge bg-night-raised rounded-xl border p-6 text-center">
          <p className="text-cream font-semibold">
            Nothing matches{currentAreaName ? ` in ${currentAreaName}` : ''} right now.
          </p>
          {fallback ? (
            <Link
              href={`/places?area=${fallback.area.slug}${openOnly ? '' : '&open=all'}`}
              className="text-sodium mt-3 inline-block font-semibold underline underline-offset-4"
            >
              {fallback.count} open in {fallback.area.name} →
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setParams({ open: 'all', tags: null })}
              className="text-sodium mt-3 font-semibold underline underline-offset-4"
            >
              Show everything that runs late →
            </button>
          )}
          <p className="text-cream-muted mt-4 text-sm">
            Know a spot we missed?{' '}
            <Link href="/submit" className="text-cream underline underline-offset-4">
              Add it
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-10 rounded-full px-3.5 text-sm whitespace-nowrap transition-colors ${
        active
          ? 'bg-sodium text-night font-semibold'
          : 'border-night-edge text-cream-muted hover:text-cream border'
      }`}
    >
      {label}
    </button>
  );
}
