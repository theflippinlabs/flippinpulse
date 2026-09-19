import { supabase } from '@/lib/supabase';

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

async function load(): Promise<{ current: Round | null; recent: Round[] }> {
  const [cur, past] = await Promise.all([
    supabase.from('lottery_rounds').select('*').eq('status', 'active').maybeSingle(),
    supabase.from('lottery_rounds').select('*').eq('status', 'drawn').order('created_at', { ascending: false }).limit(10),
  ]);
  return {
    current: (cur.data as Round | null) ?? null,
    recent: (past.data ?? []) as Round[],
  };
}

const fmt = (n: number) => n.toLocaleString('en-US');

export default async function LotteryPage() {
  const { current, recent } = await load();
  return (
    <>
      <h1 className="text-xl md:text-2xl font-bold mb-2">🎫 Lottery</h1>
      <p className="text-pulse-mute mb-4 md:mb-6 text-sm">Track the current jackpot and past winners.</p>

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
          No active round. Configure the lottery module in the bot (Panel → Modules).
        </div>
      )}

      <h2 className="text-sm uppercase tracking-wide text-pulse-mute mb-3">Recent rounds</h2>
      <div className="space-y-2">
        {recent.map(r => (
          <div key={r.id} className="bg-pulse-card border border-pulse-border rounded-xl p-3 text-sm">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold">{fmt(r.pot_pulse)} PULSE pot</div>
                <div className="text-xs text-pulse-mute">
                  {new Date(r.draw_at).toLocaleString()} · {fmt(r.total_tickets)} tickets
                </div>
              </div>
              <div className="text-right">
                {r.winner_discord_id ? (
                  <div className="text-xs">
                    🏆 <span className="font-mono">{r.winner_discord_id.slice(-6)}</span>
                  </div>
                ) : (
                  <div className="text-xs text-pulse-mute">Rolled over</div>
                )}
              </div>
            </div>
          </div>
        ))}
        {recent.length === 0 && <div className="text-pulse-mute text-sm">No past rounds recorded.</div>}
      </div>
    </>
  );
}
