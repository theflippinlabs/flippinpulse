import type { Metadata } from 'next';
import { getSession, isAdmin } from '@/lib/auth';
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
  // DO NOT redirect here. The individual pages under /app enforce auth
  // themselves. If this layout did redirect() for unauthenticated requests,
  // the Discord / Twitter / iMessage unfurl bots (which carry no session)
  // would get a 307 to "/" and the LANDING metadata — hiding the
  // member-facing openGraph card we export above.
  // When there's no session we render a stripped-down shell that still
  // carries the full metadata in <head>, so unfurlers get the right card
  // and humans see a sign-in prompt.

  const locale = getLocale();

  if (!session) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 bg-pulse-bg">
        <div className="max-w-sm w-full text-center">
          <div className="text-5xl text-pulse-gold mb-2">⚡</div>
          <h1 className="text-2xl font-bold mb-1 tracking-wider">
            PULSE
          </h1>
          <p className="text-pulse-mute text-sm mb-6">
            {locale === 'fr'
              ? 'Connecte-toi avec Discord pour ouvrir l\'app.'
              : 'Sign in with Discord to open the app.'}
          </p>
          <a
            href="/api/auth/login"
            className="block w-full rounded-lg bg-pulse-gold text-black font-semibold py-3 hover:opacity-90 shadow-brand"
          >
            {locale === 'fr' ? 'Se connecter avec Discord' : 'Sign in with Discord'}
          </a>
        </div>
      </main>
    );
  }

  const avatarUrl = session.avatar
    ? `https://cdn.discordapp.com/avatars/${session.id}/${session.avatar}.png?size=64`
    : null;

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
