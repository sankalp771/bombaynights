import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Anonymous abuse control (docs/02).
 *
 * We never store an IP address. What we store is `sha256(ip + a salt that
 * changes daily)`, which is enough to count today's submissions from one
 * source and useless for following anyone across days. The salt comes from the
 * environment when set, and is otherwise generated per process — a restart
 * simply resets the counters, which is an acceptable trade for never persisting
 * anything that identifies a person.
 */

const LIMITS = {
  submissions: 5,
  reports: 10,
} as const;

const processSalt = randomBytes(32).toString('hex');

function dailySalt(now: Date): string {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return `${process.env.RATE_LIMIT_SALT ?? processSalt}:${day}`;
}

/**
 * Best-effort client IP. Behind Vercel this is `x-forwarded-for`; the first
 * entry is the client. A missing header falls back to a constant bucket, which
 * rate-limits conservatively rather than not at all.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || headers.get('x-real-ip')?.trim() || 'unknown';
}

export function hashIp(ip: string, now: Date = new Date()): string {
  return createHash('sha256')
    .update(`${ip}|${dailySalt(now)}`)
    .digest('hex');
}

export interface RateLimitResult {
  allowed: boolean;
  used: number;
  limit: number;
}

/**
 * Count today's rows for this hashed IP. Because the salt rotates at IST
 * midnight, "today" falls out of the hash itself — yesterday's rows have a
 * different hash and cannot match.
 */
export async function checkRateLimit(
  client: SupabaseClient,
  table: 'submissions' | 'reports',
  ipHash: string,
): Promise<RateLimitResult> {
  const limit = LIMITS[table];

  const { count, error } = await client
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash);

  if (error) {
    // If we cannot count, fail closed. A dropped submission is recoverable;
    // an open write endpoint is not.
    return { allowed: false, used: limit, limit };
  }

  const used = count ?? 0;
  return { allowed: used < limit, used, limit };
}

export { LIMITS as RATE_LIMITS };
