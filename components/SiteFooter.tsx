import Link from 'next/link';

/**
 * The OpenStreetMap attribution here is a legal requirement (ODbL), not a
 * courtesy. It must stay in the footer AND on the map. Do not remove it.
 */
export function SiteFooter() {
  return (
    <footer className="border-night-edge text-cream-muted mt-16 border-t px-4 py-8 text-sm">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/" className="hover:text-cream">
            Home
          </Link>
          <Link href="/places" className="hover:text-cream">
            All places
          </Link>
          <Link href="/submit" className="hover:text-cream">
            Add a spot
          </Link>
          <Link href="/about" className="hover:text-cream">
            About
          </Link>
        </nav>
        <p className="text-xs leading-relaxed">
          Place data from{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            className="underline underline-offset-2"
            rel="noreferrer"
            target="_blank"
          >
            © OpenStreetMap contributors
          </a>{' '}
          (ODbL), plus timings verified by hand. Timings change — if a place is shut when we said it
          was open, tell us and we’ll fix it.
        </p>
      </div>
    </footer>
  );
}
