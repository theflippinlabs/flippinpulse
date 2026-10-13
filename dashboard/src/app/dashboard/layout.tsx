import { getSession, isAdmin, sessionAdminGuilds } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getLocale } from '@/lib/i18n';
import { tryCurrentGuildId } from '@/lib/guildContext';
import { supabase } from '@/lib/supabase';
import { botInstallUrl } from '@/lib/botInstall';
import DashboardShell from './DashboardShell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session) redirect('/');
  // Access rules (multi-tenant):
  //   - the env-pinned Lord (DASHBOARD_ADMIN_IDS) always gets in — legacy
  //     single-tenant deployment stays functional.
  //   - any signed-in user with at least one Discord guild where they have
  //     MANAGE_GUILD can access, so they can install Novarys on it and buy
  //     a plan.
  const adminGuilds = sessionAdminGuilds(session);
  if (!isAdmin(session.id) && adminGuilds.length === 0) redirect('/app');

  const avatarUrl = session.avatar
    ? `https://cdn.discordapp.com/avatars/${session.id}/${session.avatar}.png?size=64`
    : null;
  const locale = getLocale();
  const activeGuildId = tryCurrentGuildId();

  // Decorate each admin guild with whether the bot is already installed
  // there, so the switcher can show a 🤖 / ➕ hint.
  let decoratedGuilds: { id: string; name: string; icon: string | null; installed: boolean }[] = [];
  if (adminGuilds.length) {
    const { data } = await supabase
      .from('guild_installs')
      .select('guild_id, is_active')
      .in('guild_id', adminGuilds.map(g => g.id));
    const installedSet = new Set((data ?? []).filter(r => r.is_active).map(r => r.guild_id as string));
    decoratedGuilds = adminGuilds.map(g => ({ ...g, installed: installedSet.has(g.id) }));
  }

  return (
    <DashboardShell
      username={session.username}
      avatarUrl={avatarUrl}
      locale={locale}
      guilds={decoratedGuilds}
      activeGuildId={activeGuildId}
      installUrlBase={botInstallUrl()}
    >
      {children}
    </DashboardShell>
  );
}
