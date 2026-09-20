import { getSession, isAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getLocale } from '@/lib/i18n';
import DashboardShell from './DashboardShell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session || !isAdmin(session.id)) redirect('/');

  const avatarUrl = session.avatar
    ? `https://cdn.discordapp.com/avatars/${session.id}/${session.avatar}.png?size=64`
    : null;
  const locale = getLocale();

  return (
    <DashboardShell username={session.username} avatarUrl={avatarUrl} locale={locale}>
      {children}
    </DashboardShell>
  );
}
