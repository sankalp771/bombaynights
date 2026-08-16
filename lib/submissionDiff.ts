import { DAY_KEYS, type WeeklyHours } from './hours';
import { formatTime } from './format';
import type { Place, SubmissionPayload } from './types';

/**
 * What a correction actually changes.
 *
 * Moderating a correction by reading two full records is how mistakes get
 * approved at 2 AM. This reduces a submission to the fields that differ, in a
 * form the UI can render as "was → now", and — importantly — treats a field the
 * contributor left blank as *no opinion*, not as "delete this". That mirrors the
 * `coalesce` upsert semantics the seeders use.
 */

export interface FieldDiff {
  field: string;
  label: string;
  before: string;
  after: string;
}

const LABELS: Record<string, string> = {
  name: 'Name',
  address: 'Address',
  phone: 'Phone',
  notes: 'Notes',
  food_type: 'Food type',
  serves_alcohol: 'Serves alcohol',
  has_shisha: 'Shisha',
  categories: 'Tags',
  service_modes: 'Service',
  hours: 'Hours',
  lat: 'Latitude',
  lng: 'Longitude',
};

export function diffSubmission(place: Place, payload: SubmissionPayload): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  const push = (field: string, before: string, after: string) => {
    if (before.trim() === after.trim()) return;
    diffs.push({ field, label: LABELS[field] ?? field, before, after });
  };

  // Text fields: an empty submission means "I have nothing to say about this".
  for (const field of ['name', 'address', 'phone', 'notes'] as const) {
    const after = str(payload[field]);
    if (!after) continue;
    push(field, str(place[field]) || '—', after);
  }

  if (payload.food_type && payload.food_type !== 'unknown') {
    push('food_type', place.food_type, payload.food_type);
  }

  for (const field of ['serves_alcohol', 'has_shisha'] as const) {
    const after = payload[field];
    if (after === null || after === undefined) continue;
    push(field, tristate(place[field]), tristate(after));
  }

  for (const field of ['categories', 'service_modes'] as const) {
    const after = payload[field] ?? [];
    if (after.length === 0) continue;
    push(field, list(place[field]), list(after));
  }

  if (payload.hours) {
    push('hours', summariseHours(place.hours), summariseHours(payload.hours));
  }

  // Coordinates only count as a change if the pin actually moved — a phone GPS
  // reading is never bit-identical, and 11 m of noise is not a correction.
  if (typeof payload.lat === 'number' && typeof payload.lng === 'number') {
    const moved =
      Math.abs(payload.lat - place.lat) > 0.0001 || Math.abs(payload.lng - place.lng) > 0.0001;
    if (moved) {
      push(
        'lat',
        `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`,
        `${payload.lat.toFixed(5)}, ${payload.lng.toFixed(5)}`,
      );
    }
  }

  return diffs;
}

/** One line per distinct daily pattern, e.g. "Mon–Fri 19:00–02:30". */
export function summariseHours(hours: WeeklyHours | null | undefined): string {
  if (!hours) return 'Not known';

  const parts: string[] = [];
  for (const day of DAY_KEYS) {
    const windows = hours[day] ?? [];
    const text =
      windows.length === 0
        ? 'closed'
        : windows.map((w) => `${formatTime(w.open)}–${formatTime(w.close)}`).join(', ');
    parts.push(`${day} ${text}`);
  }
  return parts.join(' · ');
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function tristate(value: boolean | null | undefined): string {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return 'unknown';
}

function list(value: readonly string[] | null | undefined): string {
  return value && value.length > 0 ? [...value].join(', ') : '—';
}
