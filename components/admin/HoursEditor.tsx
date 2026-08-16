'use client';

import { DAY_KEYS, DAY_LABELS, type HoursWindow, type WeeklyHours } from '@/lib/hours';

/**
 * Seven rows of open/close, plus an explicit "hours not known" state.
 *
 * "Not known" is a real, distinct value here, not an empty form: a place with
 * `hours = null` reads as "Hours unverified" on the public site and is never
 * shown as open. Letting the owner clear hours back to null is what keeps a bad
 * guess from becoming a promise.
 *
 * Times use `<input type="time">`, which gives a native 24-hour picker on
 * Android and avoids parsing free text at 2 AM. `24:00` is the canonical way to
 * say midnight-at-the-end-of-the-day and the picker cannot produce it, so the
 * "closes at midnight" case is a button.
 */
export function HoursEditor({
  value,
  onChange,
}: {
  value: WeeklyHours | null;
  onChange: (next: WeeklyHours | null) => void;
}) {
  const hours = value ?? {};

  function setDay(day: string, windows: HoursWindow[]) {
    onChange({ ...hours, [day]: windows });
  }

  if (value === null) {
    return (
      <div className="border-night-edge bg-night rounded-xl border p-3">
        <p className="text-cream-muted text-sm">
          Hours not known — this place shows as “Hours unverified” and never as open.
        </p>
        <button
          type="button"
          onClick={() =>
            onChange(Object.fromEntries(DAY_KEYS.map((day) => [day, [defaultWindow()]])))
          }
          className="border-sodium text-sodium mt-2 min-h-10 rounded-lg border px-3 text-sm font-semibold"
        >
          Add hours
        </button>
      </div>
    );
  }

  return (
    <div className="border-night-edge bg-night flex flex-col gap-2 rounded-xl border p-3">
      {DAY_KEYS.map((day) => {
        const windows = hours[day] ?? [];
        const open = windows.length > 0;

        return (
          <div key={day} className="flex flex-wrap items-center gap-2">
            <label className="text-cream flex w-28 shrink-0 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={open}
                onChange={() => setDay(day, open ? [] : [defaultWindow()])}
                className="size-4 accent-[var(--color-sodium)]"
              />
              {DAY_LABELS[day]}
            </label>

            {open ? (
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {windows.map((window, index) => (
                  <div key={index} className="flex items-center gap-1.5">
                    <input
                      type="time"
                      value={displayTime(window.open)}
                      onChange={(event) =>
                        setDay(
                          day,
                          replace(windows, index, { ...window, open: event.target.value }),
                        )
                      }
                      className="border-night-edge bg-night-raised text-cream min-h-10 rounded-lg border px-2 text-sm"
                    />
                    <span className="text-cream-muted">→</span>
                    <input
                      type="time"
                      value={displayTime(window.close)}
                      onChange={(event) =>
                        setDay(
                          day,
                          replace(windows, index, { ...window, close: event.target.value }),
                        )
                      }
                      className="border-night-edge bg-night-raised text-cream min-h-10 rounded-lg border px-2 text-sm"
                    />
                    {window.close === '24:00' ? (
                      <span className="text-sodium text-xs">midnight</span>
                    ) : (
                      <button
                        type="button"
                        title="Closes at midnight"
                        onClick={() =>
                          setDay(day, replace(windows, index, { ...window, close: '24:00' }))
                        }
                        className="text-cream-muted text-xs underline underline-offset-2"
                      >
                        12 AM
                      </button>
                    )}
                    {windows.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setDay(
                            day,
                            windows.filter((_, i) => i !== index),
                          )
                        }
                        aria-label="Remove this window"
                        className="text-neon text-sm"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => setDay(day, [...windows, defaultWindow()])}
                  className="text-cream-muted text-xs underline underline-offset-2"
                  title="A place that shuts in the afternoon and reopens at night"
                >
                  + split
                </button>
              </div>
            ) : (
              <span className="text-cream-muted text-sm">closed</span>
            )}
          </div>
        );
      })}

      <div className="border-night-edge flex flex-wrap gap-3 border-t pt-2">
        <button
          type="button"
          onClick={() => {
            const monday = hours.mon ?? [defaultWindow()];
            onChange(Object.fromEntries(DAY_KEYS.map((day) => [day, monday])));
          }}
          className="text-cream-muted text-xs underline underline-offset-2"
        >
          Copy Monday to every day
        </button>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-cream-muted text-xs underline underline-offset-2"
        >
          Hours not known
        </button>
      </div>
    </div>
  );
}

function defaultWindow(): HoursWindow {
  return { open: '19:00', close: '02:00' };
}

function replace(windows: HoursWindow[], index: number, next: HoursWindow): HoursWindow[] {
  return windows.map((window, i) => (i === index ? next : window));
}

/** `<input type="time">` cannot render 24:00; show it as 00:00 in the field. */
function displayTime(value: string): string {
  return value === '24:00' ? '00:00' : value;
}
