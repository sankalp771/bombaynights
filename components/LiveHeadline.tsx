'use client';

import Link from 'next/link';
import { countOpenNow } from '@/lib/rank';
import { useNow } from '@/lib/useNow';
import type { PublicPlace } from '@/lib/types';

/**
 * "37 places open right now · 1:42 AM IST" — the first thing on the site and
 * the whole promise in one line. Both halves recompute in the browser, so a
 * cached page never shows a stale count or a stale clock.
 */
export function LiveHeadline({ places, serverNow }: { places: PublicPlace[]; serverNow: number }) {
  const now = useNow(serverNow);
  const count = countOpenNow(places, now);

  const clock = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(now);

  return (
    <div>
      <p className="font-display motion-safe:animate-flicker-on text-3xl leading-tight font-extrabold sm:text-4xl">
        <span className="neon-open tnum">{count}</span>{' '}
        <span className="text-cream">{count === 1 ? 'place open' : 'places open'}</span>{' '}
        <span className="text-cream">right now</span>
      </p>
      <p className="text-cream-muted mt-2 text-sm">
        <time className="tnum">{clock} IST</time>
        {count === 0 ? ' · nothing open this minute — try “all late-night”' : null}
      </p>
      <Link
        href="/places"
        className="bg-sodium text-night mt-4 inline-flex min-h-12 items-center rounded-lg px-5 font-semibold"
      >
        See what’s open →
      </Link>
    </div>
  );
}
