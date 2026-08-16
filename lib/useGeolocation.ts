'use client';

import { useCallback, useState } from 'react';
import type { LatLng } from './geo';

export type GeoStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable';

/**
 * Opt-in geolocation. Never requested on page load — the prompt only appears
 * when someone taps "Near me", and a refusal is a silent fall back to browsing
 * by area (docs/04). Location is never sent anywhere; it is used in the browser
 * to sort a list we already have.
 */
export function useGeolocation() {
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [position, setPosition] = useState<LatLng | null>(null);

  const locate = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }

    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (result) => {
        setPosition({ lat: result.coords.latitude, lng: result.coords.longitude });
        setStatus('ready');
      },
      (error) => {
        setStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 120_000 },
    );
  }, []);

  const clear = useCallback(() => {
    setPosition(null);
    setStatus('idle');
  }, []);

  return { status, position, locate, clear };
}
