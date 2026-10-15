import type { Metadata } from 'next';
import { getSession, isAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getLocale } from '@/lib/i18n';
import MemberShell from './MemberShell';
import InstallHint from './InstallHint';
import PushToggle from './PushToggle';

// Share metadata for /app and every page under it. Shown when a Lord drops
// pulse-engine.xyz/app in their own Discord to invite members in — the
// pitch here is member-facing (play, collect, win PULSE) rather than the
// Lord-facing landing hero.
export const metadata: Metadata = {
  title: 'Pulse — your game hub',
  description:
    'Open the app, play, collect trading cards, raise your pet, grind the Battle Pass and chat with your AI companion — all your Novarys life, one tap away.',
  openGraph: {
    title: 'Pulse — your game hub',
    description:
      'Pets, trading cards, Battle Pass, AI companion. All of it, one tap away.',
    url: 'https://pulse-engine.xyz/app',
    siteName: 'Novarys',
    locale: 'en_US',
    alternateLocale: ['fr_FR'],
    type: 'website',
    images: [{
      url: '/og-app.png',
      width: 1200,
      height: 630,
      alt: 'Pulse — Open the app, play, collect, win PULSE',
      type: 'image/png',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pulse — your game hub',
    description:
      'Pets, trading cards, Battle Pass, AI companion. All your Novarys life, one tap away.',
    images: ['/og-app.png'],
  },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session) redirect('/');

  // Note: `novarys_guild` cookie bootstrap happens in middleware.ts — a
  // Server Component layout can't call cookies().set() during render.

  const avatarUrl = session.avatar
    ? `https://cdn.discordapp.com/avatars/${session.id}/${session.avatar}.png?size=64`
    : null;
  const locale = getLocale();

  return (
    <MemberShell
      username={session.username}
      avatarUrl={avatarUrl}
      isLord={isAdmin(session.id)}
      locale={locale}
    >
      <InstallHint fr={locale === 'fr'} />
      <PushToggle fr={locale === 'fr'} />
      {children}
    </MemberShell>
  );
}
