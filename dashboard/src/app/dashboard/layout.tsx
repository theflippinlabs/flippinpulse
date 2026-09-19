import { getSession, isAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';

const NAV = [
  { href: '/dashboard', label: '🏠 Overview' },
  { href: '/dashboard/members', label: '👥 Members' },
  { href: '/dashboard/jails', label: '🔒 Jails' },
  { href: '/dashboard/tournaments', label: '🏟️ Tournaments' },
  { href: '/dashboard/cosmetics', label: '✨ Cosmetics' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session || !isAdmin(session.id)) redirect('/');

  const avatarUrl = session.avatar
    ? `https://cdn.discordapp.com/avatars/${session.id}/${session.avatar}.png?size=64`
    : null;

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 bg-pulse-card border-r border-pulse-border flex flex-col">
        <div className="px-6 py-6 border-b border-pulse-border">
          <div className="text-lg font-bold">⚡ NOVARYS</div>
          <div className="text-xs text-pulse-mute">Command Deck</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-lg hover:bg-pulse-border transition-colors"
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
            <div className="text-sm">
              <div className="font-semibold">{session.username}</div>
              <a href="/api/auth/logout" className="text-xs text-pulse-mute hover:text-pulse-brand">
                Sign out
              </a>
            </div>
          </div>
        </div>
      </aside>
      <main className="flex-1 px-8 py-8 overflow-x-hidden">{children}</main>
    </div>
  );
}
