import { Wordmark } from '@/components/Wordmark';

// Phase 0 placeholder. The real landing (live open-count, "Near me", area
// chips, closing-latest strip) is built in Phase 3 — docs/04 § Pages.
export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 pt-16">
      <Wordmark />
      <p className="text-cream-muted max-w-prose text-lg leading-relaxed">
        Everything open between <span className="text-cream tnum">12 AM</span> and{' '}
        <span className="text-cream tnum">6 AM</span> in Mumbai — Mira Road down to Colaba.
        Restaurants, bars, dhabas, shisha lounges. Timings verified by hand.
      </p>

      <div className="border-night-edge bg-night-raised rounded-lg border p-5">
        <p className="neon-open text-2xl font-semibold">OPEN till 3:30 AM</p>
        <p className="text-cream-muted mt-2 text-sm">
          Scaffold is up. Database, open-now engine and the live site land in the next phases.
        </p>
      </div>
    </main>
  );
}
