import { getSession, isAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getLocale } from '@/lib/i18n';
import { GUILD_COOKIE } from '@/lib/guildContext';
import { resolveMemberGuild } from '@/lib/memberGuild';
import MemberShell from './MemberShell';
import InstallHint from './InstallHint';
import PushToggle from './PushToggle';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session) redirect('/');

  // Make sure the member has a current-guild cookie set before any child
  // page runs its queries — otherwise currentGuildId() falls back to the
  // env default (owner's guild), leaking cross-tenant data. We pick their
  // most recently active guild; the member can later swap via a switcher.
  const existing = cookies().get(GUILD_COOKIE)?.value;
  if (!existing || !/^\d{15,20}$/.test(existing)) {
    const resolved = await resolveMemberGuild(session.id);
    if (resolved) {
      cookies().set({
        name: GUILD_COOKIE, value: resolved,
        httpOnly: true, sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/', maxAge: 60 * 60 * 24 * 30,
      });
    }
  }

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
