import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { t } from '@/lib/i18n';

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

const PODIUM_TINT: Record<number, string> = {
  0: 'from-[#F5B62E]/30 to-[#F5B62E]/5 border-[#F5B62E]/40',
  1: 'from-[#C0C0C0]/20 to-[#C0C0C0]/5 border-[#C0C0C0]/30',
  2: 'from-[#CD7F32]/20 to-[#CD7F32]/5 border-[#CD7F32]/30',
};

function PodiumSlot({ member, rank, isMe }: { member: Row; rank: number; isMe: boolean }) {
  const heights = ['h-24', 'h-16', 'h-12'];
  return (
    <div className={`flex flex-col items-center ${isMe ? 'ring-2 ring-pulse-gold rounded-xl p-1' : ''}`}>
      {member.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={member.avatar_url} alt="" className="w-12 h-12 rounded-full ring-2 ring-pulse-border" referrerPolicy="no-referrer" />
      ) : (
        <div className="w-12 h-12 rounded-full bg-pulse-border" />
      )}
      <div className="mt-1 font-bold text-xs truncate max-w-[90px] text-center">
        {member.username || member.discord_id.slice(-6)}
      </div>
      <div className="text-[10px] text-pulse-mute font-mono">{fmt(member.points_total ?? 0)} pts</div>
      <div className={`w-full mt-2 rounded-t-lg bg-gradient-to-t ${PODIUM_TINT[rank]} border border-b-0 ${heights[rank]} flex items-start justify-center pt-1`}>
        <div className="text-xl font-black">{MEDAL[rank]}</div>
      </div>
    </div>
  );
}

export default async function Leaderboard() {
  const session = getSession()!;
  const rows = await load();
  const meIdx = rows.findIndex(r => r.discord_id === session.id);
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <>
      <Link href="/app" className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold mb-3">
        <span className="text-lg leading-none">‹</span>
        <span>{t('common.back')}</span>
      </Link>
      <h1 className="text-2xl font-bold mb-1">🏆 {t('leaderboard.title')}</h1>
      <p className="text-pulse-mute text-sm mb-4">{t('leaderboard.subtitle')}</p>

      {/* Podium: #2 · #1 (centered, tallest) · #3 */}
      {podium.length > 0 && (
        <div className="grid grid-cols-3 gap-2 items-end mb-5">
          {[1, 0, 2].map(idx => {
            const m = podium[idx];
            if (!m) return <div key={idx} />;
            return <PodiumSlot key={m.discord_id} member={m} rank={idx} isMe={m.discord_id === session.id} />;
          })}
        </div>
      )}

      {meIdx >= 3 && (
        <div className="bg-pulse-gold/10 border border-pulse-gold/40 rounded-xl p-3 mb-3 flex items-center gap-3">
          <div className="text-lg font-black text-pulse-gold w-8 text-center">#{meIdx + 1}</div>
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate">{t('leaderboard.you_label')} — {rows[meIdx].username}</div>
            <div className="text-xs text-pulse-mute">{fmt(rows[meIdx].points_total)} {t('common.points')} · {fmt(rows[meIdx].balance_pulse)} PULSE</div>
          </div>
        </div>
      )}

      {/* Scrollable rest: rank #4 → #50 in a bounded container so the page
          stays short. Internal overflow-y keeps the podium in view. */}
      <div className="rounded-xl border border-pulse-border overflow-hidden">
        <div className="max-h-[60vh] overflow-y-auto">
          <ul className="divide-y divide-pulse-border/60">
            {rest.map((r, i) => {
              const rank = i + 3;
              const isMe = r.discord_id === session.id;
              return (
                <li
                  key={r.discord_id}
                  className={`flex items-center gap-3 px-3 py-2.5 ${isMe ? 'bg-pulse-gold/10' : 'bg-pulse-card'}`}
                >
                  <div className="w-8 text-center text-xs text-pulse-mute font-mono">#{rank + 1}</div>
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
                      {fmt(r.points_total)} {t('common.points')} · {fmt(r.balance_pulse)} PULSE
                    </div>
                  </div>
                  {r.points_week > 0 && (
                    <div className="text-right text-xs">
                      <div className="text-pulse-gold font-mono">+{fmt(r.points_week)}</div>
                      <div className="text-[9px] text-pulse-mute uppercase">{t('common.week_short')}</div>
                    </div>
                  )}
                </li>
              );
            })}
            {!rest.length && (
              <li className="p-4 text-center text-sm text-pulse-mute">—</li>
            )}
          </ul>
        </div>
      </div>
    </>
  );
}
