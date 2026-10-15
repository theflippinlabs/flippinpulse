import type { Metadata, Viewport } from 'next';
import './globals.css';
import { CookieBanner } from './CookieBanner';

// The marketing / share metadata every page inherits unless it overrides.
// A share on Discord, iMessage, Twitter/X, Facebook, Slack, LinkedIn, or
// anywhere else that reads Open Graph / Twitter Card tags will render the
// og.png below with the title + description — not a bare URL.
const SITE_URL = 'https://pulse-engine.xyz';
const OG_IMAGE = '/og.png'; // served from /dashboard/public/og.png

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Novarys — Your Discord server, alive 24/7',
    template: '%s · Novarys',
  },
  description:
    'Novarys turns your Discord into a game: AI moderation, Battle Pass, trading cards with PvP duels, adoptable pets, live stream alerts and a full web dashboard. Everything runs from your server, no code.',
  applicationName: 'Novarys',
  keywords: [
    'Discord bot', 'Novarys', 'community', 'Battle Pass', 'trading cards',
    'pets', 'AI companion', 'Novus', 'PULSE', 'stream alerts',
  ],
  authors: [{ name: 'The Flippin\' Labs', url: 'https://pulse-engine.xyz' }],
  creator: 'The Flippin\' Labs',
  publisher: 'The Flippin\' Labs',
  category: 'social networking',
  openGraph: {
    type: 'website',
    siteName: 'Novarys',
    title: 'Novarys — Your Discord server, alive 24/7',
    description:
      'AI community platform for Discord — Battle Pass, trading cards, pets, live stream alerts, full web dashboard.',
    url: SITE_URL,
    locale: 'en_US',
    alternateLocale: ['fr_FR'],
    images: [{
      url: OG_IMAGE,
      width: 1200,
      height: 630,
      alt: 'Novarys — Your Discord server, alive 24/7',
      type: 'image/png',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Novarys — Your Discord server, alive 24/7',
    description:
      'AI community platform for Discord — Battle Pass, trading cards, pets, live stream alerts, full web dashboard.',
    images: [OG_IMAGE],
    creator: '@theflippinlabs',
  },
  alternates: {
    canonical: SITE_URL,
    languages: {
      'en-US': SITE_URL,
      'fr-FR': SITE_URL,
    },
  },
  // Give iMessage / Discord's unfurler and iOS "Add to Home Screen" the
  // right in-app shell + title.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Novarys',
  },
  // Light hint for crawlers: index everything, follow links, no gated UA.
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
    shortcut: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#000000',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
