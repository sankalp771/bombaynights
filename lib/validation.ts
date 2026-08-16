import { z } from 'zod';
import { weeklyHoursSchema } from './hours';
import { categorySchema, foodTypeSchema, reportReasonSchema, serviceModeSchema } from './types';

/**
 * Every external input is validated here (CLAUDE.md). These schemas run on the
 * server; the browser form is a convenience, not a gate.
 */

/** Bound free text so a submission cannot be used as a storage bucket. */
const shortText = (max: number) => z.string().trim().max(max);

export const submissionSchema = z
  .object({
    name: shortText(120).min(2, 'Tell us the name'),
    area_slug: shortText(60).min(1, 'Pick an area'),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    address: shortText(300).optional().or(z.literal('')),
    categories: z.array(categorySchema).min(1, 'Pick at least one tag').max(12),
    food_type: foodTypeSchema.default('unknown'),
    serves_alcohol: z.boolean().nullable().default(null),
    has_shisha: z.boolean().nullable().default(null),
    service_modes: z.array(serviceModeSchema).max(4).default([]),
    hours: weeklyHoursSchema,
    phone: shortText(30).optional().or(z.literal('')),
    notes: shortText(400).optional().or(z.literal('')),
    /**
     * A link to a photo, not an upload — we host nothing in V1. Restricted to
     * http(s) so a `javascript:` or `data:` URL can never reach an `href` in
     * the admin.
     */
    photo_url: z
      .string()
      .trim()
      .max(500)
      .url()
      .refine((value) => /^https?:\/\//i.test(value), 'Photo link must start with http')
      .optional()
      .or(z.literal('')),
    /**
     * Credit and contact, both optional. Anonymous submission is the promise
     * (CLAUDE.md), so these can never become required — they exist for people
     * who *want* to be reachable, and the contact is never shown publicly.
     */
    submitter_name: shortText(80).optional().or(z.literal('')),
    submitter_contact: shortText(120).optional().or(z.literal('')),
    /** Set when the visitor is correcting an existing place. */
    correction_for: shortText(120).optional().or(z.literal('')),
    /**
     * Honeypot. Real people never see this field, so anything in it is a bot.
     * We accept the request and quietly drop it rather than saying "blocked",
     * which would just teach the bot to try again.
     */
    website: z.string().max(200).optional(),
  })
  .refine(
    (value) =>
      (typeof value.lat === 'number' && typeof value.lng === 'number') ||
      Boolean(value.address && value.address.trim().length > 4),
    { message: 'Drop a pin on the map or type an address', path: ['address'] },
  )
  .refine((value) => Object.values(value.hours).some((windows) => (windows?.length ?? 0) > 0), {
    message: 'Give us opening times for at least one day',
    path: ['hours'],
  });

export type SubmissionInput = z.infer<typeof submissionSchema>;

export const reportSchema = z.object({
  place_id: z.string().uuid(),
  // `osm_hours_drifted` is machine-filed only and is deliberately not offered.
  reason: reportReasonSchema.exclude(['osm_hours_drifted']),
  detail: z.string().trim().max(400).optional().or(z.literal('')),
  website: z.string().max(200).optional(),
});

export type ReportInput = z.infer<typeof reportSchema>;

/** Turn Zod issues into `{ field: message }` the form can render inline. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    errors[key] ??= issue.message;
  }
  return errors;
}
