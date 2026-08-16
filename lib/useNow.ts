'use client';

import { useEffect, useState } from 'react';

/**
 * The current instant, re-rendered on a timer.
 *
 * This is what lets a five-minute-cached page stay honest: the place data is
 * cached, but "open now" is recomputed in the browser, so a card flips to
 * "Closing soon" and then "Closed" while the visitor is still looking at it.
 *
 * Starts from a server-rendered timestamp so the first paint matches the HTML
 * and React does not complain about a hydration mismatch.
 */
export function useNow(initial: number, intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date(initial));

  useEffect(() => {
    // Correct immediately on mount: the cached HTML may be minutes old.
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
