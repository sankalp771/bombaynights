'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { bulkApprovePlaces } from '@/app/admin/actions';
import { PlaceRow } from './PlaceRow';
import { PLACE_STATUSES, type Area, type Place } from '@/lib/types';

/**
 * The places tab: filter, then act.
 *
 * Bulk approve is the reason this screen exists — a seed run drops a hundred
 * pending rows and approving them one at a time is not a workflow. Selection is
 * explicit and the button names the count, because "approve all" with an
 * invisible filter behind it is how unverified hours reach the whole city.
 */
export function PlacesManager({
  places,
  areas,
  status,
  areaId,
  search,
}: {
  places: Place[];
  areas: Area[];
  status: string;
  areaId: string;
  search: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState(search);

  const areaName = new Map(areas.map((area) => [area.id, area.name]));

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/admin/places?${next.toString()}`);
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectable = places.filter((place) => place.status !== 'approved');
  const allSelected = selectable.length > 0 && selectable.every((place) => selected.has(place.id));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {['pending', 'approved', 'rejected', 'archived', 'all'].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setParam('status', value === 'pending' ? '' : value)}
              className={`min-h-10 rounded-lg border px-3 text-sm font-medium capitalize ${
                (status || 'pending') === value
                  ? 'border-sodium text-sodium'
                  : 'border-night-edge text-cream-muted'
              }`}
            >
              {value}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={areaId}
            onChange={(event) => setParam('area', event.target.value)}
            className="border-night-edge bg-night text-cream min-h-11 flex-1 rounded-xl border px-3 text-sm"
          >
            <option value="">All areas</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>

          <form
            className="flex flex-1 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setParam('q', query);
            }}
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name"
              className="border-night-edge bg-night text-cream min-h-11 flex-1 rounded-xl border px-3 text-sm"
            />
            <button
              type="submit"
              className="border-night-edge text-cream-muted min-h-11 rounded-xl border px-3 text-sm"
            >
              Find
            </button>
          </form>
        </div>
      </div>

      <div className="text-cream-muted flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          {places.length} place{places.length === 1 ? '' : 's'}
          {places.length === 500 ? ' (capped — narrow the filter)' : ''}
        </span>

        {selectable.length > 0 ? (
          <button
            type="button"
            onClick={() =>
              setSelected(allSelected ? new Set() : new Set(selectable.map((place) => place.id)))
            }
            className="underline underline-offset-4"
          >
            {allSelected ? 'Clear selection' : `Select all ${selectable.length} on this page`}
          </button>
        ) : null}
      </div>

      {selected.size > 0 ? (
        <div className="border-sodium bg-night-raised sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border p-3">
          <span className="text-cream text-sm">{selected.size} selected</span>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await bulkApprovePlaces([...selected]);
                setMessage(result.message ?? null);
                if (result.ok) {
                  setSelected(new Set());
                  router.refresh();
                }
              })
            }
            className="bg-open text-night min-h-10 rounded-lg px-3 text-sm font-semibold disabled:opacity-50"
          >
            {pending ? 'Approving…' : `Approve ${selected.size}`}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-cream-muted text-sm underline underline-offset-4"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {message ? <p className="text-cream-muted text-sm">{message}</p> : null}

      {places.length === 0 ? (
        <p className="border-night-edge bg-night-raised text-cream-muted rounded-2xl border p-6 text-center">
          Nothing matches that filter.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {places.map((place) => (
            <li key={place.id}>
              <PlaceRow
                place={place}
                areas={areas}
                areaName={place.area_id ? (areaName.get(place.area_id) ?? null) : null}
                selected={selected.has(place.id)}
                onToggle={place.status === 'approved' ? undefined : () => toggle(place.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="text-cream-muted text-xs">
        Statuses: {PLACE_STATUSES.join(' · ')}. Archived places stay in the database and out of the
        public site — nothing is ever hard-deleted.
      </p>
    </section>
  );
}
