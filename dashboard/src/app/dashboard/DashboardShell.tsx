'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/dashboard', label: 'Overview', emoji: '🏠', short: 'Home' },
  { href: '/dashboard/members', label: 'Members', emoji: '👥', short: 'Members' },
  { href: '/dashboard/jails', label: 'Jails', emoji: '🔒', short: 'Jails' },
  { href: '/dashboard/announce', label: 'Announce', emoji: '📣', short: 'Post' },
  { href: '/dashboard/more', label: 'More', emoji: '⋯', short: 'More' },
];

const MORE_NAV = [
  { href: '/dashboard/tournaments', label: '🏟️ Tournaments' },
  { href: '/dashboard/cosmetics', label: '✨ Cosmetics' },
];

interface Props {
  username: string;
  avatarUrl: string | null;
  children: React.ReactNode;
}

export default function DashboardShell({ username, avatarUrl, children }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    if (href === '/dashboard/more') return pathname === '/dashboard/tournaments' || pathname === '/dashboard/cosmetics' || pathname === '/dashboard/more';
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen md:flex">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-pulse-card border-b border-pulse-border">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">⚡</span>
          <span className="font-bold">NOVARYS</span>
          <span className="text-xs text-pulse-mute truncate">Command Deck</span>
        </div>
        <div className="flex items-center gap-2">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-pulse-border" />
          )}
          <a href="/api/auth/logout" className="text-xs text-pulse-mute px-2 py-1 rounded border border-pulse-border">
            Sign out
          </a>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 md:shrink-0 bg-pulse-card border-r border-pulse-border flex-col">
        <div className="px-6 py-6 border-b border-pulse-border">
          <div className="text-lg font-bold">⚡ NOVARYS</div>
          <div className="text-xs text-pulse-mute">Command Deck</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {[...NAV.slice(0, 4), ...MORE_NAV].map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-lg transition-colors ${
                pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                  ? 'bg-pulse-border text-pulse-brand' : 'hover:bg-pulse-border/50'
              }`}
            >
              {'emoji' in item ? `${item.emoji} ${item.label}` : item.label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-pulse-border">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-pulse-border" />
            )}
            <div className="text-sm min-w-0 flex-1">
              <div className="font-semibold truncate">{username}</div>
              <a href="/api/auth/logout" className="text-xs text-pulse-mute hover:text-pulse-brand">
                Sign out
              </a>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 px-4 pt-5 pb-24 md:px-8 md:py-8 overflow-x-hidden">{children}</main>

      {/* Bottom nav (mobile only) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-pulse-card border-t border-pulse-border pb-safe">
        <div className="grid grid-cols-5">
          {NAV.map(item => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center py-2 gap-0.5 ${active ? 'text-pulse-brand' : 'text-pulse-mute'}`}
              >
                <span className="text-lg leading-none">{item.emoji}</span>
                <span className="text-[10px] leading-none">{item.short}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
