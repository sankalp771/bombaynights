'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { setHoursVerified, setPlaceStatus, updatePlace } from '@/app/admin/actions';
import { googleMapsSearchUrl } from '@/lib/maps';
import { HoursEditor } from './HoursEditor';
import { summariseHours } from '@/lib/submissionDiff';
import { formatDateIst } from '@/lib/istTime';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  FOOD_TYPES,
  SERVICE_MODES,
  type Area,
  type Place,
} from '@/lib/types';
import type { WeeklyHours } from '@/lib/hours';

export function PlaceRow({
  place,
  areas,
  areaName,
  selected,
  onToggle,
}: {
  place: Place;
  areas: Area[];
  areaName: string | null;
  selected: boolean;
  onToggle?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [draft, setDraft] = useState({
    name: place.name,
    address: place.address ?? '',
    area_id: place.area_id ? String(place.area_id) : '',
    categories: place.categories,
    food_type: place.food_type,
    serves_alcohol: tri(place.serves_alcohol),
    has_shisha: tri(place.has_shisha),
    service_modes: place.service_modes,
    phone: place.phone ?? '',
    notes: place.notes ?? '',
    photo_url: place.photo_url ?? '',
    last_call: place.last_call ?? '',
    price_band: place.price_band ? String(place.price_band) : '',
  });
  const [hours, setHours] = useState<WeeklyHours | null>(place.hours);

  function act(action: () => Promise<{ ok: boolean; message?: string }>) {
    startTransition(async () => {
      const result = await action();
      setMessage(result.message ?? null);
      if (result.ok) router.refresh();
    });
  }

  function save() {
    act(async () => {
      const result = await updatePlace(place.id, {
        name: draft.name,
        address: draft.address || null,
        area_id: draft.area_id ? Number(draft.area_id) : null,
        categories: draft.categories,
        food_type: draft.food_type,
        serves_alcohol: untri(draft.serves_alcohol),
        has_shisha: untri(draft.has_shisha),
        service_modes: draft.service_modes,
        hours,
        phone: draft.phone || null,
        notes: draft.notes || null,
        photo_url: draft.photo_url || '',
        last_call: draft.last_call || null,
        price_band: draft.price_band ? Number(draft.price_band) : null,
      });
      if (result.ok) setEditing(false);
      return result;
    });
  }

  return (
    <article
      className={`bg-night-raised rounded-2xl border p-4 ${
        selected ? 'border-sodium' : 'border-night-edge'
      }`}
    >
      <header className="flex flex-wrap items-start gap-3">
        {onToggle ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`Select ${place.name}`}
            className="mt-1 size-5 accent-[var(--color-sodium)]"
          />
        ) : null}

        <div className="min-w-0 flex-1">
          <h3 className="font-display text-cream text-lg font-bold">{place.name}</h3>
          <p className="text-cream-muted mt-0.5 text-xs">
            {areaName ?? 'No area'} · {place.source} · {place.status}
            {place.hours_verified ? (
              <span className="text-open ml-2">
                verified{place.verified_at ? ` ${formatDateIst(place.verified_at)}` : ''}
              </span>
            ) : null}
          </p>
          {!editing ? (
            <p className="text-cream-muted mt-2 text-sm">{summariseHours(place.hours)}</p>
          ) : null}
        </div>

        {/* Triage tool: Google's card is the fastest liveness check we are
            allowed — one click shows "Permanently closed" without us storing a
            byte of Google data. Especially for the pending OSM backlog. */}
        <a
          href={googleMapsSearchUrl([place.name, areaName ?? 'Mumbai'].join(' '))}
          target="_blank"
          rel="noreferrer"
          className="text-cream-muted text-xs underline underline-offset-4"
        >
          Google ↗
        </a>
        {place.status === 'approved' ? (
          <Link
            href={`/place/${place.slug}`}
            className="text-cream-muted text-xs underline underline-offset-4"
          >
            View
          </Link>
        ) : null}
      </header>

      {editing ? (
        <div className="mt-4 flex flex-col gap-3">
          <Field label="Name">
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="Address">
            <input
              value={draft.address}
              onChange={(event) => setDraft({ ...draft, address: event.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="Area">
            <select
              value={draft.area_id}
              onChange={(event) => setDraft({ ...draft, area_id: event.target.value })}
              className={inputClass}
            >
              <option value="">No area</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Tags">
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((category) => {
                const on = draft.categories.includes(category);
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        categories: on
                          ? draft.categories.filter((value) => value !== category)
                          : [...draft.categories, category],
                      })
                    }
                    className={`min-h-9 rounded-lg border px-2.5 text-xs ${
                      on ? 'border-sodium text-sodium' : 'border-night-edge text-cream-muted'
                    }`}
                  >
                    {CATEGORY_LABELS[category] ?? category}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Food">
              <select
                value={draft.food_type}
                onChange={(event) =>
                  setDraft({ ...draft, food_type: event.target.value as Place['food_type'] })
                }
                className={inputClass}
              >
                {FOOD_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Price band">
              <select
                value={draft.price_band}
                onChange={(event) => setDraft({ ...draft, price_band: event.target.value })}
                className={inputClass}
              >
                <option value="">unknown</option>
                {[1, 2, 3, 4].map((value) => (
                  <option key={value} value={value}>
                    {'₹'.repeat(value)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Serves alcohol">
              <select
                value={draft.serves_alcohol}
                onChange={(event) => setDraft({ ...draft, serves_alcohol: event.target.value })}
                className={inputClass}
              >
                <option value="unknown">unknown</option>
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select>
            </Field>
            <Field label="Shisha">
              <select
                value={draft.has_shisha}
                onChange={(event) => setDraft({ ...draft, has_shisha: event.target.value })}
                className={inputClass}
              >
                <option value="unknown">unknown</option>
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select>
            </Field>
          </div>

          <Field label="Service">
            <div className="flex flex-wrap gap-1.5">
              {SERVICE_MODES.map((mode) => {
                const on = draft.service_modes.includes(mode);
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        service_modes: on
                          ? draft.service_modes.filter((value) => value !== mode)
                          : [...draft.service_modes, mode],
                      })
                    }
                    className={`min-h-9 rounded-lg border px-2.5 text-xs ${
                      on ? 'border-sodium text-sodium' : 'border-night-edge text-cream-muted'
                    }`}
                  >
                    {mode.replace(/_/g, ' ')}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Hours">
            <HoursEditor value={hours} onChange={setHours} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <input
                value={draft.phone}
                onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Last call">
              <input
                value={draft.last_call}
                placeholder="01:30"
                onChange={(event) => setDraft({ ...draft, last_call: event.target.value })}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Photo link">
            <input
              value={draft.photo_url}
              placeholder="https://…"
              onChange={(event) => setDraft({ ...draft, photo_url: event.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="Notes">
            <textarea
              value={draft.notes}
              rows={2}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              className={inputClass}
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="bg-sodium text-night min-h-11 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="border-night-edge text-cream-muted min-h-11 rounded-xl border px-4 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="border-night-edge text-cream min-h-10 rounded-lg border px-3 text-sm"
          >
            Edit
          </button>

          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => setHoursVerified(place.id, !place.hours_verified))}
            className={`min-h-10 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50 ${
              place.hours_verified ? 'border-open text-open' : 'border-night-edge text-cream-muted'
            }`}
          >
            {place.hours_verified ? '✓ Hours verified' : 'Mark hours verified'}
          </button>

          {place.status !== 'approved' ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => act(() => setPlaceStatus(place.id, 'approved'))}
              className="bg-open text-night min-h-10 rounded-lg px-3 text-sm font-semibold disabled:opacity-50"
            >
              Approve
            </button>
          ) : null}

          {place.status !== 'archived' ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => act(() => setPlaceStatus(place.id, 'archived'))}
              className="border-night-edge text-cream-muted min-h-10 rounded-lg border px-3 text-sm disabled:opacity-50"
            >
              Archive
            </button>
          ) : null}
        </div>
      )}

      {message ? <p className="text-cream-muted mt-3 text-sm">{message}</p> : null}
    </article>
  );
}

const inputClass =
  'min-h-11 w-full rounded-xl border border-night-edge bg-night px-3 text-sm text-cream outline-none focus:border-sodium';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-cream-muted text-xs font-semibold tracking-wide uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

function tri(value: boolean | null): string {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return 'unknown';
}

function untri(value: string): boolean | null {
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return null;
}
