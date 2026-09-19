import { supabase } from '@/lib/supabase';
import { loadChannels } from '@/lib/channels';
import BackLink from '../BackLink';
import LotteryActions from './LotteryActions';

export const dynamic = 'force-dynamic';

interface Round {
  id: string;
  status: string;
  pot_pulse: number;
  ticket_price: number;
  total_tickets: number;
  draw_at: string;
  winner_discord_id: string | null;
  created_at: string;
}

async function load(): Promise<{ current: Round | null; recent: Round[]; announceChannel: string | null }> {
  const [cur, past, cfg] = await Promise.all([
    supabase.from('lottery_rounds').select('*').eq('status', 'active').maybeSingle(),
    supabase.from('lottery_rounds').select('*').eq('status', 'drawn').order('created_at', { ascending: false }).limit(20),
    supabase.from('settings').select('value_json').eq('key', 'lottery_config').maybeSingle(),
  ]);
  const conf = (cfg.data?.value_json as { announce_channel_id?: string | null } | null) ?? {};
  return {
    current: (cur.data as Round | null) ?? null,
    recent: (past.data ?? []) as Round[],
    announceChannel: conf.announce_channel_id ?? null,
  };
}

const fmt = (n: number) => n.toLocaleString('en-US');

export default async function LotteryPage() {
  const [{ current, recent, announceChannel }, channels] = await Promise.all([load(), loadChannels()]);
  return (
    <>
      <BackLink />
      <h1 className="text-xl md:text-2xl font-bold mb-2">🎫 Lottery</h1>
      <p className="text-pulse-mute mb-4 md:mb-6 text-sm">Announce the jackpot, force a draw, review past rounds.</p>

      {current ? (
        <div className="bg-gradient-to-br from-pulse-gold/20 to-pulse-gold/5 border border-pulse-gold/30 rounded-2xl p-5 mb-6">
          <div className="text-xs uppercase text-pulse-mute mb-1">Current jackpot</div>
          <div className="text-4xl font-bold">{fmt(current.pot_pulse)} <span className="text-lg text-pulse-mute">PULSE</span></div>
          <div className="mt-3 text-sm">
            🎟️ Ticket price: <span className="font-semibold">{fmt(current.ticket_price)} PULSE</span>
            <span className="text-pulse-mute"> · </span>
            🧾 Tickets sold: <span className="font-semibold">{fmt(current.total_tickets)}</span>
          </div>
          <div className="mt-2 text-xs text-pulse-mute">Next draw: {new Date(current.draw_at).toLocaleString()}</div>
        </div>
      ) : (
        <div className="bg-pulse-card border border-pulse-border rounded-xl p-5 mb-6 text-pulse-mute text-sm">
          No active round yet. It will start automatically once the bot boots the lottery module.
        </div>
      )}

      <LotteryActions
        channels={channels}
        potPulse={current?.pot_pulse ?? 0}
        ticketPrice={current?.ticket_price ?? 50}
        drawAt={current?.draw_at ?? null}
        defaultChannelId={announceChannel}
      />

      <details className="bg-pulse-card border border-pulse-border rounded-xl group">
        <summary className="list-none cursor-pointer p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-lg">📜</div>
            <div>
              <div className="font-semibold">Recent rounds</div>
              <div className="text-xs text-pulse-mute">{recent.length} past round{recent.length === 1 ? '' : 's'}</div>
            </div>
          </div>
          <span className="text-pulse-mute text-xl group-open:rotate-180 transition-transform">›</span>
        </summary>
        <div className="border-t border-pulse-border/60 divide-y divide-pulse-border/60">
          {recent.map(r => (
            <div key={r.id} className="p-3 text-sm">
              <div className="flex justify-between items-start">
                <div className="min-w-0">
                  <div className="font-semibold">{fmt(r.pot_pulse)} PULSE pot</div>
                  <div className="text-xs text-pulse-mute">
                    {new Date(r.draw_at).toLocaleString()} · {fmt(r.total_tickets)} tickets
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  {r.winner_discord_id ? (
                    <div className="text-xs text-pulse-gold flex items-center gap-1">
                      <span>🏆</span>
                      <span className="font-mono">{r.winner_discord_id.slice(-6)}</span>
                    </div>
                  ) : (
                    <div className="text-xs text-pulse-mute">Rolled over</div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {recent.length === 0 && (
            <div className="p-4 text-pulse-mute text-sm text-center">No past rounds yet.</div>
          )}
        </div>
      </details>
    </>
  );
}
