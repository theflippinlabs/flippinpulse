'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LocaleContext, useT, type Locale } from '@/lib/i18n-client';
import LocaleToggle from './LocaleToggle';

interface Props {
  username: string;
  avatarUrl: string | null;
  isLord: boolean;
  locale: Locale;
  children: React.ReactNode;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/app') return pathname === '/app';
  return pathname === href || pathname.startsWith(href + '/');
}

function ShellInner({ username, avatarUrl, isLord, children }: Omit<Props, 'locale'>) {
  const pathname = usePathname();
  const t = useT();

  const NAV_LEFT = [
    { href: '/app',              label: t('nav.home'), emoji: '🏠' },
    { href: '/app/leaderboard',  label: t('nav.top'),  emoji: '🏆' },
  ];
  const NAV_RIGHT = [
    { href: '/app/shop',         label: t('nav.shop'),  emoji: '🛍️' },
    { href: '/app/novus',        label: t('nav.novus'), emoji: '🧠' },
  ];
  const CENTER = { href: '/app/play', label: t('nav.play'), emoji: '🎮' };

  const NavItem = ({ href, label, emoji }: { href: string; label: string; emoji: string }) => {
    const active = isActive(pathname, href);
    return (
      <Link
        href={href}
        className={`flex flex-col items-center pt-2 pb-1 gap-0.5 ${active ? 'text-pulse-gold' : 'text-pulse-mute'}`}
      >
        <span className="text-lg leading-none">{emoji}</span>
        <span className="text-[10px] leading-none">{label}</span>
      </Link>
    );
  };

  const centerActive = isActive(pathname, CENTER.href);

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-black/90 backdrop-blur border-b border-pulse-border pt-safe">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg text-pulse-gold">⚡</span>
            <span className="font-bold tracking-wider">NOVARYS</span>
            <span className="text-xs text-pulse-mute truncate">Pulse</span>
          </div>
          <div className="flex items-center gap-2">
            <LocaleToggle />
            {isLord && (
              <a href="/dashboard" className="text-[10px] px-2 py-1 rounded-lg bg-pulse-gold/20 text-pulse-gold border border-pulse-gold/40 font-semibold">
                {t('nav.command_deck')}
              </a>
            )}
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={username} className="w-7 h-7 rounded-full ring-1 ring-pulse-gold/40" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-pulse-border" />
            )}
            <a href="/api/auth/logout" className="text-xs text-pulse-mute px-2 py-1 rounded border border-pulse-border">
              {t('nav.sign_out')}
            </a>
          </div>
        </div>
      </header>

      <main className="px-4 pt-5 pb-28 overflow-x-hidden">{children}</main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-black/95 backdrop-blur border-t border-pulse-border pb-safe">
        <div className="relative grid grid-cols-5 items-end">
          {NAV_LEFT.map(item => <NavItem key={item.href} {...item} />)}
          <div className="flex justify-center relative">
            <Link
              href={CENTER.href}
              className={`absolute -top-6 p-[2px] rounded-full bg-brand-gradient ${
                centerActive ? 'shadow-gold scale-105' : 'shadow-brand'
              } transition-transform`}
            >
              <div className="w-14 h-14 rounded-full bg-black flex items-center justify-center ring-1 ring-pulse-border">
                <span className="text-2xl leading-none">{CENTER.emoji}</span>
              </div>
            </Link>
            <span className={`text-[10px] leading-none mt-9 mb-1 ${centerActive ? 'text-pulse-gold' : 'text-pulse-mute'}`}>
              {CENTER.label}
            </span>
          </div>
          {NAV_RIGHT.map(item => <NavItem key={item.href} {...item} />)}
        </div>
      </nav>
    </div>
  );
}

export default function MemberShell({ locale, ...rest }: Props) {
  return (
    <LocaleContext.Provider value={locale}>
      <ShellInner {...rest} />
    </LocaleContext.Provider>
  );
}
