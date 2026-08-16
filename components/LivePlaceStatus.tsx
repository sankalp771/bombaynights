'use client';

import { getOpenState } from '@/lib/openNow';
import { useNow } from '@/lib/useNow';
import type { WeeklyHours } from '@/lib/hours';
import { StatusLine } from './StatusLine';

/** The hero status line on a detail page — the same neon sign, larger. */
export function LivePlaceStatus({
  hours,
  serverNow,
}: {
  hours: WeeklyHours | null;
  serverNow: number;
}) {
  const now = useNow(serverNow);
  return <StatusLine state={getOpenState(hours, now)} size="hero" flicker />;
}
