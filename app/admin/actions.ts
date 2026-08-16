'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase';
import { createSessionClient, isAdminEmail, requireAdmin } from '@/lib/adminAuth';
import { slugify } from '@/lib/format';
import { nullableWeeklyHoursSchema } from '@/lib/hours';
import {
  foodTypeSchema,
  normalizeCategories,
  normalizeServiceModes,
  placeStatusSchema,
  submissionRowSchema,
  type SubmissionPayload,
} from '@/lib/types';

/**
 * Every admin mutation in the app.
 *
 * Two rules hold throughout, and both are load-bearing:
 *
 *  1. `requireAdmin()` runs first in every exported action. A Server Action is
 *     a public HTTP endpoint with a guessable-by-design id — being unreachable
 *     from the UI protects nothing.
 *  2. Input is Zod-parsed before it reaches the service-role client, which
 *     bypasses RLS entirely.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const uuid = z.string().uuid();

/** The subset of a place the owner can edit by hand. */
const placeEditSchema = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(300).nullish(),
  area_id: z.coerce.number().int().nullish(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  categories: z.array(z.string()).max(20).default([]),
  food_type: foodTypeSchema.default('unknown'),
  serves_alcohol: z.boolean().nullish(),
  has_shisha: z.boolean().nullish(),
  service_modes: z.array(z.string()).max(4).default([]),
  hours: nullableWeeklyHoursSchema,
  last_call: z.string().trim().max(5).nullish(),
  price_band: z.coerce.number().int().min(1).max(4).nullish(),
  phone: z.string().trim().max(30).nullish(),
  notes: z.string().trim().max(400).nullish(),
  photo_url: z.string().trim().url().max(500).nullish().or(z.literal('')),
});

/* ------------------------------------------------------------------ auth -- */

/**
 * Sends the one-time code. Refuses any address that is not `ADMIN_EMAIL`, so a
 * stranger cannot even mint an `authenticated` session against this project —
 * Supabase would happily create the user otherwise.
 *
 * The response is identical either way. Telling someone "that is not the admin
 * email" confirms which address is, and this form is on the public internet.
 */
export async function sendLoginCode(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();

  const sent: ActionResult = {
    ok: true,
    message: 'If that address is the admin, the sign-in code is on its way. It expires in an hour.',
  };

  if (!z.string().email().safeParse(email).success) {
    return { ok: false, message: 'That does not look like an email address.' };
  }
  if (!isAdminEmail(email)) return sent;

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // There is one admin and the account already exists after the first login.
    // Leaving this true would let a typo silently create a second user.
    options: { shouldCreateUser: true },
  });

  if (error) return { ok: false, message: `Supabase refused to send it: ${error.message}` };
  return sent;
}

export async function verifyLoginCode(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const token = String(formData.get('token') ?? '').trim();

  if (!isAdminEmail(email)) return { ok: false, message: 'That code did not work.' };
  // Supabase's OTP length is a per-project setting (6 by default, 8 on this
  // project) and can be changed in the dashboard without a deploy. Accept any
  // plausible length rather than hard-coding one and locking the owner out.
  if (!/^\d{6,10}$/.test(token)) {
    return { ok: false, message: 'That code should be the digits from the email, nothing else.' };
  }

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });

  if (error || !isAdminEmail(data.user?.email)) {
    return { ok: false, message: 'That code did not work. Ask for a new one.' };
  }

  redirect('/admin/queue');
}

export async function signOut(): Promise<void> {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect('/admin/login');
}

/* ------------------------------------------------------------ submissions -- */

/**
 * Approves a submission.
 *
 * A `new_place` becomes a row in `places` as `approved` / `source='community'`.
 * A `correction` is merged into the place it refers to, field by field, keeping
 * anything the visitor left blank — same `coalesce` semantics the seeders use
 * (DECISIONS, Phase 1): a contributor who only knows the hours must not blank
 * out the phone number.
 *
 * `edits` carries whatever the owner changed in the review form, so approving a
 * near-miss does not mean rejecting it and retyping it.
 */
export async function approveSubmission(
  submissionId: string,
  edits: unknown = {},
): Promise<ActionResult> {
  await requireAdmin();
  const id = uuid.parse(submissionId);
  const client = createServiceClient();

  const { data: raw, error: loadError } = await client
    .from('submissions')
    .select('id,payload,kind,place_id,status,admin_note,created_at')
    .eq('id', id)
    .maybeSingle();

  if (loadError || !raw) return { ok: false, message: 'That submission is gone.' };

  const submission = submissionRowSchema.parse(raw);
  if (submission.status !== 'pending') {
    return { ok: false, message: `Already ${submission.status}.` };
  }

  const overrides = placeEditSchema.partial().parse(edits ?? {});
  const payload: SubmissionPayload = { ...submission.payload, ...stripUndefined(overrides) };

  const areaId = await resolveAreaId(payload.area_slug ?? null, overrides.area_id ?? null);

  if (submission.kind === 'correction' && submission.place_id) {
    const patch = stripUndefined({
      ...toPlaceColumns(payload, areaId),
      // A correction never re-verifies a place: a human still has to confirm it.
      updated_at: new Date().toISOString(),
    });
    delete (patch as Record<string, unknown>).slug;

    const { error } = await client.from('places').update(patch).eq('id', submission.place_id);
    if (error) return { ok: false, message: `Could not apply it: ${error.message}` };
  } else {
    if (typeof payload.lat !== 'number' || typeof payload.lng !== 'number') {
      return {
        ok: false,
        message: 'This one has no coordinates — add a lat/lng in the form before approving.',
      };
    }

    const areaName = areaId ? await areaNameById(areaId) : null;
    const slug = await uniqueSlug(slugify(payload.name, areaName));

    const { error } = await client.from('places').insert({
      ...toPlaceColumns(payload, areaId),
      slug,
      status: 'approved',
      source: 'community',
      hours_verified: false,
    });

    if (error) return { ok: false, message: `Could not create the place: ${error.message}` };
  }

  const { error: markError } = await client
    .from('submissions')
    .update({ status: 'approved' })
    .eq('id', id);

  if (markError) return { ok: false, message: `Published, but could not close the queue item.` };

  revalidateAdmin();
  return { ok: true, message: 'Approved and live.' };
}

export async function rejectSubmission(submissionId: string, note?: string): Promise<ActionResult> {
  await requireAdmin();
  const id = uuid.parse(submissionId);

  const { error } = await createServiceClient()
    .from('submissions')
    .update({
      status: 'rejected',
      admin_note: note?.trim() ? note.trim().slice(0, 400) : null,
    })
    .eq('id', id);

  if (error) return { ok: false, message: `Could not reject it: ${error.message}` };

  revalidateAdmin();
  return { ok: true, message: 'Rejected.' };
}

/* ----------------------------------------------------------------- places -- */

export async function updatePlace(placeId: string, edits: unknown): Promise<ActionResult> {
  await requireAdmin();
  const id = uuid.parse(placeId);

  const parsed = placeEditSchema.partial().safeParse(edits);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Some fields need fixing.' };
  }

  const patch = stripUndefined({
    ...parsed.data,
    categories: parsed.data.categories ? normalizeCategories(parsed.data.categories) : undefined,
    service_modes: parsed.data.service_modes
      ? normalizeServiceModes(parsed.data.service_modes)
      : undefined,
    photo_url: parsed.data.photo_url === '' ? null : parsed.data.photo_url,
    updated_at: new Date().toISOString(),
  });

  const { error } = await createServiceClient().from('places').update(patch).eq('id', id);
  if (error) return { ok: false, message: `Could not save: ${error.message}` };

  revalidateAdmin();
  revalidatePath('/places');
  return { ok: true, message: 'Saved.' };
}

/**
 * The verify toggle. Turning it on stamps `verified_at` with the moment a human
 * actually confirmed the hours; turning it off clears it, because a stale
 * timestamp on an unverified row is worse than no timestamp at all.
 *
 * Machines never call this (`hours_verified` is flipped by humans only — the
 * monthly refresh files a report instead).
 */
export async function setHoursVerified(placeId: string, verified: boolean): Promise<ActionResult> {
  await requireAdmin();
  const id = uuid.parse(placeId);
  const now = new Date().toISOString();

  const { error } = await createServiceClient()
    .from('places')
    .update({
      hours_verified: verified,
      verified_at: verified ? now : null,
      updated_at: now,
    })
    .eq('id', id);

  if (error) return { ok: false, message: `Could not update: ${error.message}` };

  revalidateAdmin();
  revalidatePath('/places');
  return { ok: true, message: verified ? 'Marked verified.' : 'Verification cleared.' };
}

export async function setPlaceStatus(placeId: string, status: unknown): Promise<ActionResult> {
  await requireAdmin();
  const id = uuid.parse(placeId);
  const next = placeStatusSchema.parse(status);

  const { error } = await createServiceClient()
    .from('places')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { ok: false, message: `Could not update: ${error.message}` };

  revalidateAdmin();
  revalidatePath('/places');
  return { ok: true, message: `Moved to ${next}.` };
}

/**
 * Bulk approve, for clearing a seed batch. Capped at 200 ids per call: a
 * runaway "approve everything" is exactly the kind of mistake that publishes
 * unverified hours to the whole city, and 200 is far more than a human reviews
 * in one sitting.
 */
export async function bulkApprovePlaces(placeIds: string[]): Promise<ActionResult> {
  await requireAdmin();
  const ids = z.array(uuid).min(1).max(200).parse(placeIds);

  const { error } = await createServiceClient()
    .from('places')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .in('id', ids);

  if (error) return { ok: false, message: `Could not approve them: ${error.message}` };

  revalidateAdmin();
  revalidatePath('/places');
  return { ok: true, message: `Approved ${ids.length} place${ids.length === 1 ? '' : 's'}.` };
}

/* ---------------------------------------------------------------- reports -- */

export async function resolveReports(reportIds: string[]): Promise<ActionResult> {
  await requireAdmin();
  const ids = z.array(uuid).min(1).max(200).parse(reportIds);

  const { error } = await createServiceClient()
    .from('reports')
    .update({ resolved_at: new Date().toISOString() })
    .in('id', ids);

  if (error) return { ok: false, message: `Could not resolve: ${error.message}` };

  revalidateAdmin();
  return { ok: true, message: `Resolved ${ids.length}.` };
}

/* ---------------------------------------------------------------- helpers -- */

function revalidateAdmin(): void {
  revalidatePath('/admin', 'layout');
}

/** Drops keys whose value is `undefined` so a partial patch stays partial. */
function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

function toPlaceColumns(payload: SubmissionPayload, areaId: number | null) {
  return stripUndefined({
    name: payload.name?.trim() || undefined,
    address: payload.address?.trim() || null,
    area_id: areaId,
    lat: typeof payload.lat === 'number' ? payload.lat : undefined,
    lng: typeof payload.lng === 'number' ? payload.lng : undefined,
    categories: normalizeCategories(payload.categories ?? []),
    food_type: payload.food_type ?? 'unknown',
    serves_alcohol: payload.serves_alcohol ?? null,
    has_shisha: payload.has_shisha ?? null,
    service_modes: normalizeServiceModes(payload.service_modes ?? []),
    hours: payload.hours ?? undefined,
    phone: payload.phone?.trim() || null,
    notes: payload.notes?.trim() || null,
    photo_url: payload.photo_url?.trim() || null,
  });
}

async function resolveAreaId(
  areaSlug: string | null,
  explicitAreaId: number | null,
): Promise<number | null> {
  if (typeof explicitAreaId === 'number') return explicitAreaId;
  if (!areaSlug) return null;

  const { data } = await createServiceClient()
    .from('areas')
    .select('id')
    .eq('slug', areaSlug)
    .maybeSingle();

  return (data as { id: number } | null)?.id ?? null;
}

async function areaNameById(areaId: number): Promise<string | null> {
  const { data } = await createServiceClient()
    .from('areas')
    .select('name')
    .eq('id', areaId)
    .maybeSingle();

  return (data as { name: string } | null)?.name ?? null;
}

/**
 * `places.slug` is unique. Two "Sardar Pav Bhaji" submissions a month apart
 * must not make the second approval fail with a constraint error the owner has
 * to decode, so we suffix until it is free.
 */
async function uniqueSlug(base: string): Promise<string> {
  const client = createServiceClient();
  const root = base || 'place';

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`;
    const { data } = await client.from('places').select('id').eq('slug', candidate).maybeSingle();
    if (!data) return candidate;
  }

  return `${root}-${Date.now()}`;
}
