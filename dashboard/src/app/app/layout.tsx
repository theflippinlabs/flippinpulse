import { getSession, isAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getLocale } from '@/lib/i18n';
import MemberShell from './MemberShell';
import InstallHint from './InstallHint';
import PushToggle from './PushToggle';

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
