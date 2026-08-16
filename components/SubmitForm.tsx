'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CATEGORY_LABELS, CATEGORIES, SERVICE_MODES, type Area, type Category } from '@/lib/types';
import { DAY_KEYS, DAY_LABELS, type WeeklyHours } from '@/lib/hours';

/**
 * Anonymous submission (docs/04). No login, no email, nothing optional
 * pretending to be required.
 *
 * The "same every day" shortcut exists because that is true of most late-night
 * places and typing seven identical rows on a phone at 1 AM is how you lose a
 * contributor.
 */
export function SubmitForm({ areas }: { areas: Area[] }) {
  const params = useSearchParams();
  const correctionFor = params.get('correction') ?? '';

  const [name, setName] = useState('');
  const [areaSlug, setAreaSlug] = useState(areas[0]?.slug ?? '');
  const [address, setAddress] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [foodType, setFoodType] = useState<'veg' | 'nonveg' | 'both' | 'unknown'>('unknown');
  const [alcohol, setAlcohol] = useState<'yes' | 'no' | 'unknown'>('unknown');
  const [shisha, setShisha] = useState<'yes' | 'no' | 'unknown'>('unknown');
  const [serviceModes, setServiceModes] = useState<string[]>([]);
  const [sameEveryDay, setSameEveryDay] = useState(true);
  const [openTime, setOpenTime] = useState('19:00');
  const [closeTime, setCloseTime] = useState('02:00');
  const [perDay, setPerDay] = useState<
    Record<string, { open: string; close: string; on: boolean }>
  >(Object.fromEntries(DAY_KEYS.map((day) => [day, { open: '19:00', close: '02:00', on: true }])));
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [honeypot, setHoneypot] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  function buildHours(): WeeklyHours {
    if (sameEveryDay) {
      return Object.fromEntries(
        DAY_KEYS.map((day) => [day, [{ open: openTime, close: closeTime }]]),
      ) as WeeklyHours;
    }
    return Object.fromEntries(
      DAY_KEYS.map((day) => {
        const entry = perDay[day];
        return [day, entry?.on ? [{ open: entry.open, close: entry.close }] : []];
      }),
    ) as WeeklyHours;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setErrors({});

    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          area_slug: areaSlug,
          address,
          categories,
          food_type: foodType,
          serves_alcohol: alcohol === 'unknown' ? null : alcohol === 'yes',
          has_shisha: shisha === 'unknown' ? null : shisha === 'yes',
          service_modes: serviceModes,
          hours: buildHours(),
          phone,
          notes,
          correction_for: correctionFor,
          website: honeypot,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        fields?: Record<string, string>;
      };

      if (!response.ok) {
        setErrors(payload.fields ?? { form: payload.error ?? 'Something went wrong.' });
        return;
      }
      setDone(true);
    } catch {
      setErrors({ form: 'No connection. Try again when you have signal.' });
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="border-night-edge bg-night-raised mt-6 rounded-xl border p-6">
        <p className="neon-open font-display text-xl font-bold">THANKS</p>
        <p className="text-cream mt-2">
          Goes live after review. We check timings before publishing — that’s the whole point of the
          badge.
        </p>
        <Link
          href="/places"
          className="text-sodium mt-4 inline-block font-semibold underline underline-offset-4"
        >
          Back to what’s open →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-6">
      {correctionFor ? (
        <p className="border-sodium/40 bg-sodium/10 text-cream rounded-lg border p-3 text-sm">
          Suggesting an edit to <span className="font-semibold">{correctionFor}</span>. Fill in what
          you know — we’ll compare it against what we have.
        </p>
      ) : null}

      <Field label="Name" error={errors.name}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={120}
          placeholder="e.g. Sardar Pav Bhaji"
          className={inputClass}
        />
      </Field>

      <Field label="Area" error={errors.area_slug}>
        <select
          value={areaSlug}
          onChange={(event) => setAreaSlug(event.target.value)}
          className={inputClass}
        >
          {areas.map((area) => (
            <option key={area.slug} value={area.slug}>
              {area.name}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Where exactly?"
        error={errors.address}
        hint="Street, landmark — enough to find it"
      >
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          maxLength={300}
          placeholder="e.g. Tardeo Road, opposite AC Market"
          className={inputClass}
        />
      </Field>

      <Field label="What is it?" error={errors.categories} hint="Pick at least one">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => {
            const active = categories.includes(category);
            return (
              <button
                key={category}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setCategories(
                    active
                      ? categories.filter((value) => value !== category)
                      : [...categories, category],
                  )
                }
                className={`min-h-10 rounded-full px-3 text-sm ${
                  active
                    ? 'bg-sodium text-night font-semibold'
                    : 'border-night-edge text-cream-muted border'
                }`}
              >
                {CATEGORY_LABELS[category]}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Timings" error={errors.hours}>
        <label className="text-cream-muted mb-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={sameEveryDay}
            onChange={(event) => setSameEveryDay(event.target.checked)}
            className="accent-sodium size-4"
          />
          Same every day
        </label>

        {sameEveryDay ? (
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={openTime}
              onChange={(event) => setOpenTime(event.target.value)}
              className={inputClass}
            />
            <span className="text-cream-muted">to</span>
            <input
              type="time"
              value={closeTime}
              onChange={(event) => setCloseTime(event.target.value)}
              className={inputClass}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {DAY_KEYS.map((day) => {
              const entry = perDay[day] ?? { open: '19:00', close: '02:00', on: true };
              return (
                <div key={day} className="flex items-center gap-2">
                  <label className="flex w-28 shrink-0 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={entry.on}
                      onChange={(event) =>
                        setPerDay({ ...perDay, [day]: { ...entry, on: event.target.checked } })
                      }
                      className="accent-sodium size-4"
                    />
                    {DAY_LABELS[day].slice(0, 3)}
                  </label>
                  <input
                    type="time"
                    value={entry.open}
                    disabled={!entry.on}
                    onChange={(event) =>
                      setPerDay({ ...perDay, [day]: { ...entry, open: event.target.value } })
                    }
                    className={`${inputClass} disabled:opacity-40`}
                  />
                  <input
                    type="time"
                    value={entry.close}
                    disabled={!entry.on}
                    onChange={(event) =>
                      setPerDay({ ...perDay, [day]: { ...entry, close: event.target.value } })
                    }
                    className={`${inputClass} disabled:opacity-40`}
                  />
                </div>
              );
            })}
          </div>
        )}
        <p className="text-cream-muted mt-2 text-xs">
          Closing after midnight is normal here — 7 PM to 2 AM is exactly what we want.
        </p>
      </Field>

      <details className="border-night-edge rounded-xl border p-4">
        <summary className="text-cream cursor-pointer font-semibold">
          Anything else? (all optional)
        </summary>

        <div className="mt-4 flex flex-col gap-5">
          <Field label="Veg or non-veg">
            <Segmented
              value={foodType}
              onChange={(value) => setFoodType(value as typeof foodType)}
              options={[
                ['unknown', 'Not sure'],
                ['veg', 'Pure veg'],
                ['nonveg', 'Non-veg'],
                ['both', 'Both'],
              ]}
            />
          </Field>

          <Field label="Serves alcohol">
            <Segmented
              value={alcohol}
              onChange={(value) => setAlcohol(value as typeof alcohol)}
              options={[
                ['unknown', 'Not sure'],
                ['yes', 'Yes'],
                ['no', 'No'],
              ]}
            />
          </Field>

          <Field label="Shisha">
            <Segmented
              value={shisha}
              onChange={(value) => setShisha(value as typeof shisha)}
              options={[
                ['unknown', 'Not sure'],
                ['yes', 'Yes'],
                ['no', 'No'],
              ]}
            />
          </Field>

          <Field label="How do they serve?">
            <div className="flex flex-wrap gap-2">
              {SERVICE_MODES.map((mode) => {
                const active = serviceModes.includes(mode);
                return (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setServiceModes(
                        active
                          ? serviceModes.filter((value) => value !== mode)
                          : [...serviceModes, mode],
                      )
                    }
                    className={`min-h-10 rounded-full px-3 text-sm ${
                      active
                        ? 'bg-sodium text-night font-semibold'
                        : 'border-night-edge text-cream-muted border'
                    }`}
                  >
                    {mode.replace('_', ' ')}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Phone">
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              maxLength={30}
              inputMode="tel"
              className={inputClass}
            />
          </Field>

          <Field label="Anything worth knowing?" hint="One line. What makes it worth the trip.">
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={400}
              rows={3}
              className={inputClass}
            />
          </Field>
        </div>
      </details>

      {/* Honeypot: invisible to people, filled in by bots. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={honeypot}
        onChange={(event) => setHoneypot(event.target.value)}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
      />

      {errors.form ? (
        <p className="border-neon/40 text-neon rounded-lg border p-3 text-sm">{errors.form}</p>
      ) : null}

      <button
        type="submit"
        disabled={sending}
        className="bg-sodium text-night min-h-14 rounded-xl font-semibold disabled:opacity-60"
      >
        {sending ? 'Sending…' : 'Send it in'}
      </button>

      <p className="text-cream-muted text-xs">
        No login, no email, nothing tracked. Goes live after we check it.
      </p>
    </form>
  );
}

const inputClass =
  'border-night-edge bg-night text-cream min-h-12 w-full rounded-lg border px-3 py-2 text-base';

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-cream mb-1.5 block font-semibold">{label}</span>
      {hint ? <span className="text-cream-muted mb-2 block text-sm">{hint}</span> : null}
      {children}
      {error ? <span className="text-neon mt-1.5 block text-sm">{error}</span> : null}
    </label>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([optionValue, label]) => (
        <button
          key={optionValue}
          type="button"
          aria-pressed={value === optionValue}
          onClick={() => onChange(optionValue)}
          className={`min-h-10 rounded-full px-3 text-sm ${
            value === optionValue
              ? 'bg-sodium text-night font-semibold'
              : 'border-night-edge text-cream-muted border'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
