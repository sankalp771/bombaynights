'use client';

import { formatTime } from '@/lib/format';
import { DAY_KEYS, DAY_LABELS, type WeeklyHours } from '@/lib/hours';
import { toIst } from '@/lib/openNow';
import { useNow } from '@/lib/useNow';

/**
 * The full week, with today highlighted. "Today" is the IST day, computed in
 * the browser and refreshed on a timer — so at 00:05 the highlight has already
 * moved on, even on a page cached before midnight.
 */
export function WeekTable({ hours, serverNow }: { hours: WeeklyHours; serverNow: number }) {
  const now = useNow(serverNow, 60_000);
  const today = toIst(now).day;

  return (
    <table className="border-night-edge w-full overflow-hidden rounded-xl border text-sm">
      <caption className="sr-only">Opening hours by day, Mumbai time</caption>
      <tbody>
        {DAY_KEYS.map((day) => {
          const windows = hours[day] ?? [];
          const isToday = day === today;

          return (
            <tr
              key={day}
              className={`border-night-edge border-b last:border-b-0 ${
                isToday ? 'bg-sodium/10' : ''
              }`}
            >
              <th
                scope="row"
                className={`px-4 py-2.5 text-left font-medium ${
                  isToday ? 'text-sodium' : 'text-cream-muted'
                }`}
              >
                {DAY_LABELS[day]}
                {isToday ? <span className="ml-2 text-xs font-normal">today</span> : null}
              </th>
              <td
                className={`tnum px-4 py-2.5 text-right ${isToday ? 'text-cream' : 'text-cream/80'}`}
              >
                {windows.length === 0
                  ? 'Closed'
                  : windows
                      .map((window) =>
                        window.open === '00:00' && window.close === '24:00'
                          ? 'Open 24 hours'
                          : `${formatTime(window.open)} – ${formatTime(window.close)}`,
                      )
                      .join(', ')}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
