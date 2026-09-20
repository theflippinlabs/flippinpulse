import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface Row {
  discord_id: string;
  username: string;
  balance_pulse: number;
  points_total: number;
  points_week: number;
  rank_name: string | null;
  avatar_url: string | null;
}

async function load(): Promise<Row[]> {
  const { data } = await supabase
    .from('discord_users')
    .select('discord_id, username, balance_pulse, points_total, points_week, rank_name, avatar_url')
    .order('points_total', { ascending: false })
    .limit(50);
  return (data ?? []) as Row[];
}

const MEDAL: Record<number, string> = { 0: '🥇', 1: '🥈', 2: '🥉' };
const fmt = (n: number) => (n ?? 0).toLocaleString('en-US');

export default async function Leaderboard() {
  const session = getSession()!;
  const rows = await load();
  const meIdx = rows.findIndex(r => r.discord_id === session.id);

  return (
    <>
      <Link href="/app" className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold mb-3">
        <span className="text-lg leading-none">‹</span>
        <span>Retour</span>
      </Link>
      <h1 className="text-2xl font-bold mb-1">🏆 Classement</h1>
      <p className="text-pulse-mute text-sm mb-4">Top 50 par points totaux.</p>

      {meIdx >= 0 && meIdx > 2 && (
        <div className="bg-pulse-gold/10 border border-pulse-gold/40 rounded-xl p-3 mb-4 flex items-center gap-3">
          <div className="text-lg font-black text-pulse-gold w-8 text-center">#{meIdx + 1}</div>
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate">Toi — {rows[meIdx].username}</div>
            <div className="text-xs text-pulse-mute">{fmt(rows[meIdx].points_total)} pts · {fmt(rows[meIdx].balance_pulse)} PULSE</div>
          </div>
        </div>
      )}

      <ul className="space-y-2">
        {rows.map((r, i) => {
          const isMe = r.discord_id === session.id;
          return (
            <li
              key={r.discord_id}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${
                isMe ? 'bg-pulse-gold/10 border-pulse-gold/40' : 'bg-pulse-card border-pulse-border'
              }`}
            >
              <div className="w-8 text-center text-lg font-black">
                {MEDAL[i] ?? <span className="text-pulse-mute text-xs">#{i + 1}</span>}
              </div>
              {r.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.avatar_url} alt="" className="w-9 h-9 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-pulse-border" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-semibold truncate">{r.username || r.discord_id.slice(-6)}</div>
                  {r.rank_name && (
                    <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-pulse-gold/10 text-pulse-gold border border-pulse-gold/20">
                      {r.rank_name}
                    </span>
                  )}
                </div>
                <div className="text-xs text-pulse-mute font-mono mt-0.5">
                  {fmt(r.points_total)} pts · {fmt(r.balance_pulse)} PULSE
                </div>
              </div>
              {r.points_week > 0 && (
                <div className="text-right text-xs">
                  <div className="text-pulse-gold font-mono">+{fmt(r.points_week)}</div>
                  <div className="text-[9px] text-pulse-mute uppercase">7j</div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
