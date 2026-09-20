import BackLink from '../BackLink';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const DAYS = 14;

function isoDay(d: Date): string { return d.toISOString().slice(0, 10); }

function bucketize<T extends { created_at: string }>(rows: T[]): Map<string, number> {
  const map = new Map<string, number>();
  const now = new Date();
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(now.getTime() - (DAYS - 1 - i) * 86_400_000);
    map.set(isoDay(d), 0);
  }
  for (const row of rows) {
    const day = row.created_at.slice(0, 10);
    if (map.has(day)) map.set(day, (map.get(day) ?? 0) + 1);
  }
  return map;
}

function sumBuckets<T extends { created_at: string; amount: number }>(rows: T[]): Map<string, number> {
  const map = new Map<string, number>();
  const now = new Date();
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(now.getTime() - (DAYS - 1 - i) * 86_400_000);
    map.set(isoDay(d), 0);
  }
  for (const row of rows) {
    const day = row.created_at.slice(0, 10);
    if (map.has(day)) map.set(day, (map.get(day) ?? 0) + row.amount);
  }
  return map;
}

async function loadCharts() {
  const cutoff = new Date(Date.now() - DAYS * 86_400_000).toISOString();
  const [messages, gamesPlayed, pulseIn, gamesTop] = await Promise.all([
    supabase.from('activity_events').select('created_at').eq('type', 'message').gte('created_at', cutoff).limit(50_000),
    supabase.from('game_players').select('joined_at').gte('joined_at', cutoff).limit(50_000),
    supabase.from('pulse_transactions').select('created_at, amount').gt('amount', 0).gte('created_at', cutoff).limit(50_000),
    supabase.from('game_players').select('session_id').limit(50_000),
  ]);

  const msgs = bucketize((messages.data ?? []) as { created_at: string }[]);
  const games = bucketize(
    ((gamesPlayed.data ?? []) as { joined_at: string }[]).map(r => ({ created_at: r.joined_at }))
  );
  const pulse = sumBuckets((pulseIn.data ?? []) as { created_at: string; amount: number }[]);

  return { msgs, games, pulse };
}

function BarChart({ data, tint, formatValue }: {
  data: Map<string, number>;
  tint: string;
  formatValue?: (n: number) => string;
}) {
  const entries = [...data.entries()];
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const barW = 100 / entries.length;
  return (
    <div>
      <svg viewBox="0 0 100 34" preserveAspectRatio="none" className="w-full h-24">
        {entries.map(([day, val], i) => {
          const h = (val / max) * 32;
          return (
            <g key={day}>
              <rect
                x={i * barW + 0.4}
                y={32 - h}
                width={barW - 0.8}
                height={h}
                rx={0.6}
                fill={tint}
                opacity={val > 0 ? 0.9 : 0.15}
              />
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-pulse-mute mt-1">
        <span>{entries[0]?.[0].slice(5)}</span>
        <span>{entries[entries.length - 1]?.[0].slice(5)}</span>
      </div>
      <div className="text-[11px] text-pulse-mute mt-1">
        Peak: <span className="text-pulse-gold">{formatValue ? formatValue(max) : max.toLocaleString('en-US')}</span>
        <span className="mx-1">·</span>
        Total: {formatValue ? formatValue(entries.reduce((s, [, v]) => s + v, 0)) : entries.reduce((s, [, v]) => s + v, 0).toLocaleString('en-US')}
      </div>
    </div>
  );
}

const fmtPulse = (n: number) => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toString();

export default async function ChartsPage() {
  const { msgs, games, pulse } = await loadCharts();

  return (
    <>
      <BackLink />
      <h1 className="text-xl md:text-2xl font-bold mb-2">📊 Charts &amp; trends</h1>
      <p className="text-pulse-mute mb-6 text-sm">Last {DAYS} days of community activity.</p>

      <div className="space-y-4">
        <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">💬</span>
            <div>
              <div className="font-semibold">Messages per day</div>
              <div className="text-xs text-pulse-mute">Every message counted for PULSE</div>
            </div>
          </div>
          <BarChart data={msgs} tint="#22D3EE" />
        </div>

        <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🎮</span>
            <div>
              <div className="font-semibold">Games played per day</div>
              <div className="text-xs text-pulse-mute">Every entry into a game session</div>
            </div>
          </div>
          <BarChart data={games} tint="#A855F7" />
        </div>

        <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">💰</span>
            <div>
              <div className="font-semibold">PULSE minted per day</div>
              <div className="text-xs text-pulse-mute">Sum of positive PULSE transactions</div>
            </div>
          </div>
          <BarChart data={pulse} tint="#F5B62E" formatValue={fmtPulse} />
        </div>
      </div>
    </>
  );
}
