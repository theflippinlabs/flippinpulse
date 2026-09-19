'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LEFT = [
  { href: '/dashboard', label: 'Home', emoji: '🏠' },
  { href: '/dashboard/members', label: 'Members', emoji: '👥' },
];
const NAV_RIGHT = [
  { href: '/dashboard/announce', label: 'Post', emoji: '📣' },
  { href: '/dashboard/jails', label: 'Jails', emoji: '🔒' },
];
const HUB = { href: '/dashboard/hub', label: 'Hub', emoji: '⚡' };

const DESKTOP_NAV = [
  { href: '/dashboard', label: '🏠 Home' },
  { href: '/dashboard/members', label: '👥 Members' },
  { href: '/dashboard/announce', label: '📣 Announce' },
  { href: '/dashboard/jails', label: '🔒 Jails' },
  { href: '/dashboard/hub', label: '⚡ Hub' },
  { href: '/dashboard/games', label: '🎮 Games' },
  { href: '/dashboard/tournaments', label: '🏟️ Tournaments' },
  { href: '/dashboard/novus', label: '🧠 Novus' },
  { href: '/dashboard/missions', label: '🎯 Missions' },
  { href: '/dashboard/cosmetics', label: '✨ Cosmetics' },
  { href: '/dashboard/lottery', label: '🎫 Lottery' },
];

interface Props {
  username: string;
  avatarUrl: string | null;
  children: React.ReactNode;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  if (href === '/dashboard/hub') {
    return ['/dashboard/hub', '/dashboard/games', '/dashboard/tournaments', '/dashboard/cosmetics', '/dashboard/lottery', '/dashboard/novus', '/dashboard/missions']
      .some(p => pathname === p || pathname.startsWith(p + '/'));
  }
  return pathname === href || pathname.startsWith(href + '/');
}

export default function DashboardShell({ username, avatarUrl, children }: Props) {
  const pathname = usePathname();

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

  const hubActive = isActive(pathname, HUB.href);

  return (
    <div className="min-h-screen md:flex">
      {/* Mobile top bar — respects iOS safe area */}
      <header className="md:hidden sticky top-0 z-30 bg-black/90 backdrop-blur border-b border-pulse-border pt-safe">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg text-pulse-gold">⚡</span>
            <span className="font-bold tracking-wider">NOVARYS</span>
            <span className="text-xs text-pulse-mute truncate">Command Deck</span>
          </div>
          <div className="flex items-center gap-2">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full ring-1 ring-pulse-gold/40" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-pulse-border" />
            )}
            <a href="/api/auth/logout" className="text-xs text-pulse-mute px-2 py-1 rounded border border-pulse-border">
              Sign out
            </a>
          </div>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 md:shrink-0 bg-pulse-card border-r border-pulse-border flex-col">
        <div className="px-6 py-6 border-b border-pulse-border">
          <div className="text-lg font-bold tracking-wider"><span className="text-pulse-gold">⚡</span> NOVARYS</div>
          <div className="text-xs text-pulse-mute">Command Deck</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {DESKTOP_NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-lg transition-colors ${
                pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                  ? 'bg-pulse-gold/10 text-pulse-gold border border-pulse-gold/20'
                  : 'hover:bg-pulse-border/50 border border-transparent text-pulse-text/80'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-pulse-border">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full ring-1 ring-pulse-gold/40" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-pulse-border" />
            )}
            <div className="text-sm min-w-0 flex-1">
              <div className="font-semibold truncate">{username}</div>
              <a href="/api/auth/logout" className="text-xs text-pulse-mute hover:text-pulse-gold">
                Sign out
              </a>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 px-4 pt-5 pb-28 md:px-8 md:py-8 overflow-x-hidden">{children}</main>

      {/* Bottom nav (mobile only) — Hub in the middle, raised */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-black/95 backdrop-blur border-t border-pulse-border pb-safe">
        <div className="relative grid grid-cols-5 items-end">
          {NAV_LEFT.map(item => <NavItem key={item.href} {...item} />)}

          {/* Hub center button — dark disc with gradient rim (like the logo) */}
          <div className="flex justify-center relative">
            <Link
              href={HUB.href}
              className={`absolute -top-6 p-[2px] rounded-full bg-brand-gradient ${
                hubActive ? 'shadow-gold scale-105' : 'shadow-brand'
              } transition-transform`}
            >
              <div className="w-14 h-14 rounded-full bg-black flex items-center justify-center ring-1 ring-pulse-border">
                <span className="text-2xl leading-none text-pulse-gold">{HUB.emoji}</span>
              </div>
            </Link>
            <span className={`text-[10px] leading-none mt-9 mb-1 ${hubActive ? 'text-pulse-gold' : 'text-pulse-mute'}`}>
              {HUB.label}
            </span>
          </div>

          {NAV_RIGHT.map(item => <NavItem key={item.href} {...item} />)}
        </div>
      </nav>
    </div>
  );
}
