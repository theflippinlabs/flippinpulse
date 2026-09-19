'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/dashboard', label: '🏠 Overview' },
  { href: '/dashboard/members', label: '👥 Members' },
  { href: '/dashboard/jails', label: '🔒 Jails' },
  { href: '/dashboard/tournaments', label: '🏟️ Tournaments' },
  { href: '/dashboard/cosmetics', label: '✨ Cosmetics' },
];

interface Props {
  username: string;
  avatarUrl: string | null;
  children: React.ReactNode;
}

export default function DashboardShell({ username, avatarUrl, children }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  return (
    <div className="min-h-screen md:flex">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-pulse-card border-b border-pulse-border">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚡</span>
          <span className="font-bold">NOVARYS</span>
          <span className="text-xs text-pulse-mute">Command Deck</span>
        </div>
        <button
          onClick={() => setOpen(v => !v)}
          className="px-3 py-1.5 rounded-lg bg-pulse-border/50 border border-pulse-border text-sm"
          aria-label="Toggle menu"
        >
          {open ? '✕' : '☰'}
        </button>
      </header>

      {/* Mobile drawer (below top bar) */}
      {open && (
        <div className="md:hidden bg-pulse-card border-b border-pulse-border px-3 py-2 space-y-1">
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`block px-3 py-2 rounded-lg text-sm ${
                isActive(item.href) ? 'bg-pulse-border text-pulse-brand' : 'hover:bg-pulse-border/50'
              }`}
            >
              {item.label}
            </Link>
          ))}
          <div className="border-t border-pulse-border mt-2 pt-2 flex items-center gap-3 px-3">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-pulse-border" />
            )}
            <div className="text-sm flex-1">
              <div className="font-semibold truncate">{username}</div>
            </div>
            <a href="/api/auth/logout" className="text-xs text-pulse-mute hover:text-pulse-brand">
              Sign out
            </a>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 md:shrink-0 bg-pulse-card border-r border-pulse-border flex-col">
        <div className="px-6 py-6 border-b border-pulse-border">
          <div className="text-lg font-bold">⚡ NOVARYS</div>
          <div className="text-xs text-pulse-mute">Command Deck</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-lg transition-colors ${
                isActive(item.href) ? 'bg-pulse-border text-pulse-brand' : 'hover:bg-pulse-border/50'
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

      <main className="flex-1 min-w-0 px-4 py-5 md:px-8 md:py-8 overflow-x-hidden">{children}</main>
    </div>
  );
}
