import type { Metadata, Viewport } from 'next';
import { Baloo_Bhaijaan_2, IBM_Plex_Sans } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { SiteFooter } from '@/components/SiteFooter';
import { getSiteUrl } from '@/lib/siteUrl';

/*
 * Display face: Baloo Bhaijaan 2 (Ek Type / Indian Type Foundry) — warm,
 * heavy-set signage energy with genuine local flavour, and it carries
 * Devanagari if the wordmark ever needs it. Body: IBM Plex Sans — clean,
 * excellent tabular figures, not the default grotesk. Both are self-hosted by
 * next/font at build time: zero external requests, zero cost.
 */
const baloo = Baloo_Bhaijaan_2({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-baloo',
  display: 'swap',
});

const plex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex',
  display: 'swap',
});

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'BombayNights — what’s open right now in Mumbai',
    template: '%s · BombayNights',
  },
  description:
    'Every restaurant, bar, street-food joint and shisha lounge open between 12 AM and 6 AM in Mumbai, Mira Road to Colaba. Verified timings.',
  applicationName: 'BombayNights',
  manifest: '/manifest.webmanifest',
  keywords: [
    'late night food Mumbai',
    'open now Mumbai',
    'open after midnight Mumbai',
    '24 hours restaurant Mumbai',
    'shisha lounge Mumbai',
  ],
  icons: {
    icon: '/favicon.png',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'BombayNights',
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    type: 'website',
    siteName: 'BombayNights',
    locale: 'en_IN',
    title: 'BombayNights — what’s open right now in Mumbai',
    description:
      'Every restaurant, bar, street-food joint and shisha lounge open between 12 AM and 6 AM in Mumbai. Verified timings.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BombayNights — what’s open right now in Mumbai',
    description: 'Open between 12 AM and 6 AM. Mira Road to Colaba. Verified timings.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#0b0e15',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${baloo.variable} ${plex.variable}`}>
      <body className="flex min-h-dvh flex-col antialiased">
        <div className="flex-1">{children}</div>
        <SiteFooter />
        {/*
          Page views only — custom events are Pro-only on Vercel, and the Hobby
          allowance is 50k events/month. Because every place has its own URL,
          per-place popularity still falls out of plain page views.
          Self-hosted by Vercel, so it costs one small first-party request and
          no cookie banner.
        */}
        <Analytics />
      </body>
    </html>
  );
}
