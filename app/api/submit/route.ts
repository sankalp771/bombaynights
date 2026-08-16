import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkRateLimit, clientIp, hashIp } from '@/lib/rateLimit';
import { fieldErrors, submissionSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Anonymous place submissions. No login, no email, no tracking.
 *
 * Order matters here: parse → honeypot → rate limit → insert. The service-role
 * key is only reached on the last step, and only with data that has already
 * passed a Zod schema. Nothing written here is public — it lands in
 * `submissions` as pending, for the owner to approve in /admin.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected JSON' }, { status: 400 });
  }

  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Some fields need fixing', fields: fieldErrors(parsed.error) },
      { status: 422 },
    );
  }

  const input = parsed.data;

  // Honeypot: bots fill the hidden field. Answer exactly as if it worked, so
  // they have nothing to learn from and no reason to retry.
  if (input.website && input.website.trim().length > 0) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const ipHash = hashIp(clientIp(request.headers));
  const client = createServiceClient();

  const limit = await checkRateLimit(client, 'submissions', ipHash);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `That’s ${limit.limit} submissions from here today — thanks, genuinely. Try again tomorrow.`,
      },
      { status: 429 },
    );
  }

  const { website: _honeypot, correction_for: correctionFor, ...payload } = input;

  let placeId: string | null = null;
  if (correctionFor) {
    const { data } = await client
      .from('places')
      .select('id')
      .eq('slug', correctionFor)
      .eq('status', 'approved')
      .maybeSingle();
    placeId = (data as { id: string } | null)?.id ?? null;
  }

  const { error } = await client.from('submissions').insert({
    payload: { ...payload, source_hint: 'community', corrected_slug: correctionFor || null },
    kind: placeId ? 'correction' : 'new_place',
    place_id: placeId,
    ip_hash: ipHash,
  });

  if (error) {
    return NextResponse.json(
      { error: 'Could not save that — try again in a minute.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, remaining: limit.limit - limit.used - 1 }, { status: 201 });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: 'POST only' }, { status: 405 });
}
