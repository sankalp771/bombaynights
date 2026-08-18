'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import type { Map as LeafletMap, LayerGroup } from 'leaflet';
// Loaded with this chunk, not the main bundle — MapView is dynamically imported.
import 'leaflet/dist/leaflet.css';
import { formatTime } from '@/lib/format';
import type { RankedPlace } from '@/lib/rank';
import type { Area } from '@/lib/types';

/**
 * Leaflet + OpenStreetMap raster tiles. Loaded only when the visitor taps
 * "Map", never on first paint.
 *
 * The "© OpenStreetMap contributors" attribution below is a legal requirement
 * under ODbL, not decoration. Do not remove it, and do not shrink it into
 * illegibility.
 */
export function MapView({
  entries,
  areaById,
}: {
  entries: RankedPlace[];
  areaById: Map<number, Area>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      const L = await import('leaflet');
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: [19.05, 72.84],
        zoom: 12,
        scrollWheelZoom: false,
      });

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      mapRef.current = map;
      markersRef.current = L.layerGroup().addTo(map);
    }

    void setup();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function draw() {
      const L = await import('leaflet');
      const map = mapRef.current;
      const layer = markersRef.current;
      if (cancelled || !map || !layer) return;

      layer.clearLayers();
      // Community places may have no pin (address only) — they live in the
      // list views; the map shows only what it can place honestly.
      const pinned = entries.flatMap((entry) =>
        entry.place.lat != null && entry.place.lng != null
          ? [{ entry, lat: entry.place.lat, lng: entry.place.lng }]
          : [],
      );
      if (pinned.length === 0) return;

      for (const { entry, lat, lng } of pinned) {
        const open = entry.state.kind === 'open' || entry.state.kind === 'always_open';
        const soon = entry.state.kind === 'open' && entry.state.closingSoon;
        const colour = soon ? '#ffa928' : open ? '#5bc98c' : '#9d9689';
        const areaName = entry.place.area_id ? areaById.get(entry.place.area_id)?.name : '';

        const closing =
          entry.state.kind === 'always_open'
            ? 'Open 24×7'
            : entry.state.kind === 'open'
              ? `Open till ${formatTime(entry.state.closesAt)}`
              : entry.state.kind === 'unknown'
                ? 'Hours unverified'
                : 'Closed';

        L.circleMarker([lat, lng], {
          radius: 8,
          color: colour,
          weight: 2,
          fillColor: colour,
          fillOpacity: open ? 0.75 : 0.25,
        })
          .bindPopup(
            `<strong>${escapeHtml(entry.place.name)}</strong><br>` +
              `${escapeHtml(areaName ?? '')}<br>` +
              `<span style="color:${colour}">${escapeHtml(closing)}</span><br>` +
              `<a href="/place/${encodeURIComponent(entry.place.slug)}">Details →</a>`,
          )
          .addTo(layer);
      }

      map.fitBounds(
        pinned.map(({ lat, lng }) => [lat, lng] as [number, number]),
        { padding: [30, 30], maxZoom: 15 },
      );
    }

    void draw();
    return () => {
      cancelled = true;
    };
  }, [entries, areaById]);

  return (
    <div>
      <div
        ref={containerRef}
        className="border-night-edge h-[60vh] w-full overflow-hidden rounded-xl border"
        role="application"
        aria-label="Map of late-night places"
      />
      <p className="text-cream-muted mt-2 text-xs">
        Map data ©{' '}
        <a
          href="https://www.openstreetmap.org/copyright"
          className="underline underline-offset-2"
          target="_blank"
          rel="noreferrer"
        >
          OpenStreetMap
        </a>{' '}
        contributors ·{' '}
        <Link href="/places" className="underline underline-offset-2">
          back to the list
        </Link>
      </p>
    </div>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
