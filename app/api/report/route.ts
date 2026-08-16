import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { checkRateLimit, clientIp, hashIp } from '@/lib/rateLimit';
import { fieldErrors, reportSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "This was shut when you said open." One tap, no login.
 *
 * This is the feedback loop that keeps the ✓ badge meaningful, so the barrier
 * to reporting has to stay near zero — while still refusing anything that is
 * not a real reason about a real approved place.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected JSON' }, { status: 400 });
  }

  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Could not read that report', fields: fieldErrors(parsed.error) },
      { status: 422 },
    );
  }

  const input = parsed.data;
  if (input.website && input.website.trim().length > 0) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const ipHash = hashIp(clientIp(request.headers));
  const client = createServiceClient();

  const limit = await checkRateLimit(client, 'reports', ipHash);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'That’s a lot of reports from here today. Try again tomorrow.' },
      { status: 429 },
    );
  }

  // Only report against a place that is actually published — a report about a
  // pending row would tell an anonymous caller that the row exists.
  const { data: place } = await client
    .from('places')
    .select('id')
    .eq('id', input.place_id)
    .eq('status', 'approved')
    .maybeSingle();

  if (!place) {
    return NextResponse.json({ error: 'Unknown place' }, { status: 404 });
  }

  const { error } = await client.from('reports').insert({
    place_id: input.place_id,
    reason: input.reason,
    detail: input.detail || null,
    ip_hash: ipHash,
  });

  if (error) {
    return NextResponse.json({ error: 'Could not file that — try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: 'POST only' }, { status: 405 });
}
