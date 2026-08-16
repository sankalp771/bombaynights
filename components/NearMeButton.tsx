'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useGeolocation } from '@/lib/useGeolocation';

/**
 * Geolocation is asked for only on tap, and a refusal is never a dead end — we
 * just send them to the list, where the area chips are waiting (docs/04).
 */
export function NearMeButton() {
  const router = useRouter();
  const { status, position, locate } = useGeolocation();

  useEffect(() => {
    if (position) router.push('/places?near=1');
  }, [position, router]);

  useEffect(() => {
    if (status === 'denied' || status === 'unavailable') router.push('/places');
  }, [status, router]);

  return (
    <button
      type="button"
      onClick={locate}
      className="bg-sodium text-night flex min-h-14 items-center justify-center rounded-xl px-4 font-semibold"
    >
      {status === 'locating' ? 'Finding you…' : 'Near me'}
    </button>
  );
}
