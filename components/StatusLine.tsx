import { formatTime } from '@/lib/format';
import { DAY_SHORT } from '@/lib/hours';
import type { OpenState } from '@/lib/openNow';

/**
 * The signature element (docs/04). Every card carries one, treated like a small
 * neon sign: green and glowing when open, amber when closing soon, dark when
 * shut. This IS the product promise made visual — it is the one place we spend
 * boldness, and everything else on the page stays quiet.
 *
 * It never guesses. Unknown hours read "Hours unverified", never "open".
 */
export function StatusLine({
  state,
  size = 'card',
  flicker = false,
}: {
  state: OpenState;
  size?: 'card' | 'hero';
  flicker?: boolean;
}) {
  const scale = size === 'hero' ? 'text-2xl sm:text-3xl' : 'text-[0.95rem] sm:text-base';
  const base = `font-display font-bold tracking-wide tnum ${scale}`;
  const animation = flicker ? 'motion-safe:animate-flicker-on' : '';

  switch (state.kind) {
    case 'always_open':
      return (
        <p className={`${base} neon-open ${animation}`}>
          OPEN <span className="opacity-80">24×7</span>
        </p>
      );

    case 'open':
      return (
        <p className={`${base} ${state.closingSoon ? 'neon-soon' : 'neon-open'} ${animation}`}>
          {state.closingSoon ? 'CLOSING SOON' : 'OPEN'}
          <span className="opacity-80"> · till {formatTime(state.closesAt)}</span>
        </p>
      );

    case 'closed':
      return (
        <p className={`${base} neon-closed font-semibold`}>
          CLOSED
          {state.next ? (
            <span className="opacity-80">
              {' '}
              · opens{state.nextIsToday ? '' : ` ${DAY_SHORT[state.next.day]}`}{' '}
              {formatTime(state.next.time)}
            </span>
          ) : null}
        </p>
      );

    case 'unknown':
      return (
        <p className={`${base} neon-closed font-semibold`}>
          <span className="opacity-90">HOURS UNVERIFIED</span>
        </p>
      );
  }
}
