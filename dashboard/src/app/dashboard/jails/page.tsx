import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface Jail {
  discord_id: string;
  moderator_id: string | null;
  reason: string | null;
  jailed_at: string;
  expires_at: string | null;
}

async function loadJails(): Promise<Jail[]> {
  const { data } = await supabase
    .from('jailed_members')
    .select('discord_id, moderator_id, reason, jailed_at, expires_at')
    .order('jailed_at', { ascending: false });
  return (data ?? []) as Jail[];
}

export default async function JailsPage() {
  const jails = await loadJails();
  return (
    <>
      <h1 className="text-2xl font-bold mb-2">Jails</h1>
      <p className="text-pulse-mute mb-6 text-sm">{jails.length} member{jails.length === 1 ? '' : 's'} currently jailed.</p>
      <div className="bg-pulse-card border border-pulse-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-pulse-border/40 text-pulse-mute uppercase text-xs">
            <tr>
              <th className="text-left px-4 py-2">Inmate</th>
              <th className="text-left px-4 py-2">Jailed by</th>
              <th className="text-left px-4 py-2">Reason</th>
              <th className="text-left px-4 py-2">Jailed at</th>
              <th className="text-left px-4 py-2">Release</th>
            </tr>
          </thead>
          <tbody>
            {jails.map(j => (
              <tr key={j.discord_id + j.jailed_at} className="border-t border-pulse-border/50">
                <td className="px-4 py-2 font-mono">{j.discord_id}</td>
                <td className="px-4 py-2 font-mono text-pulse-mute">{j.moderator_id ?? '—'}</td>
                <td className="px-4 py-2 text-pulse-text">{j.reason ?? '_no reason_'}</td>
                <td className="px-4 py-2 text-pulse-mute">{new Date(j.jailed_at).toLocaleString()}</td>
                <td className="px-4 py-2">
                  {j.expires_at ? (
                    <span className="text-pulse-mute">{new Date(j.expires_at).toLocaleString()}</span>
                  ) : (
                    <span className="text-pulse-gold">⛓️ For life</span>
                  )}
                </td>
              </tr>
            ))}
            {jails.length === 0 && (
              <tr><td colSpan={5} className="text-center py-6 text-pulse-mute">Nobody in jail. Peaceful.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
