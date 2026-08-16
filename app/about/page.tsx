import type { Metadata } from 'next';
import Link from 'next/link';
import { Wordmark } from '@/components/Wordmark';

export const metadata: Metadata = {
  title: 'About',
  description:
    'What BombayNights is, how the verified badge works, and why the data comes from OpenStreetMap plus a lot of hand-checking.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 pt-6">
      <Link href="/" className="inline-block">
        <Wordmark as="span" />
      </Link>

      <h1 className="mt-5 text-3xl leading-tight font-extrabold">About</h1>

      <div className="text-cream/90 mt-6 flex flex-col gap-6 leading-relaxed">
        <p>
          At 1 AM in Mumbai, finding somewhere that is <em>actually</em> open is guesswork. Google
          hours go stale for late-night places, delivery apps are built around delivery, and the
          listicles rot within months. Groups burn forty minutes deciding, drive somewhere, find
          shutters down, and go home.
        </p>

        <p>
          BombayNights is a directory of everything open between <span className="tnum">12 AM</span>{' '}
          and <span className="tnum">6 AM</span> — restaurants, bars, dhabas, cafés, street-food
          counters, shisha lounges — from Mira Road down to Colaba. One promise:{' '}
          <strong className="text-cream">if it says open, it is open.</strong>
        </p>

        <section>
          <h2 className="text-cream text-xl font-bold">How the badge works</h2>
          <p className="mt-2">
            A <span className="text-open font-semibold">Verified ✓</span> means a human confirmed
            that place’s real late-night behaviour and stamped the date. Nothing earns it
            automatically — not an import, not a scraper, not a well-meaning submission. Everything
            else is shown honestly as unverified, and a place whose hours we do not know is never
            shown as open. We would rather say nothing than send you across the city on a guess.
          </p>
        </section>

        <section>
          <h2 className="text-cream text-xl font-bold">Where the data comes from</h2>
          <ul className="mt-2 flex list-disc flex-col gap-2 pl-5">
            <li>
              <strong className="text-cream">OpenStreetMap</strong> — the free, community-built map
              of the world, used as a starting point. Its late-night hours coverage in Mumbai is
              thin, which is exactly why the rest of this list exists.
            </li>
            <li>
              <strong className="text-cream">Hand-curated entries</strong> — places added and
              checked one at a time. This is the part Google does not have.
            </li>
            <li>
              <strong className="text-cream">You</strong> — anonymous submissions and one-tap “this
              was shut” reports. Every one is reviewed before it goes live.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-cream text-xl font-bold">Timings</h2>
          <p className="mt-2">
            Every open/closed calculation happens in Mumbai time, whatever timezone your phone is
            set to. A place open 7 PM to 2:30 AM is correctly shown as open at 1 AM — which sounds
            obvious and is the single most common thing other listings get wrong.
          </p>
        </section>

        <section>
          <h2 className="text-cream text-xl font-bold">Privacy</h2>
          <p className="mt-2">
            No accounts, no tracking, no email. If you tap “Near me”, your location is used in your
            browser to sort a list you already downloaded — it is never sent to us. Submissions and
            reports store a daily-rotating hash of your IP purely to stop spam; it cannot be linked
            across days and cannot be turned back into an address.
          </p>
        </section>

        <section>
          <h2 className="text-cream text-xl font-bold">Credits</h2>
          <p className="mt-2">
            Map data and much of the initial place data ©{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              className="text-sodium underline underline-offset-4"
              target="_blank"
              rel="noreferrer"
            >
              OpenStreetMap contributors
            </a>
            , used under the Open Database Licence. Map tiles by the OpenStreetMap Foundation. If
            you spot something wrong on the underlying map, fixing it there fixes it here too.
          </p>
        </section>

        <p className="border-night-edge border-t pt-6">
          Found a mistake?{' '}
          <Link href="/submit" className="text-sodium underline underline-offset-4">
            Tell us
          </Link>
          . It takes a minute and it keeps the badge worth something.
        </p>
      </div>
    </main>
  );
}
