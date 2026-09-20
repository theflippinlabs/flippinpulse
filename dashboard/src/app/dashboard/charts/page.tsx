import BackLink from '../BackLink';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const DAYS = 14;
const MS_DAY = 86_400_000;

function isoDay(d: Date): string { return d.toISOString().slice(0, 10); }

function emptyBuckets(): Map<string, number> {
  const map = new Map<string, number>();
  const now = new Date();
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(now.getTime() - (DAYS - 1 - i) * MS_DAY);
    map.set(isoDay(d), 0);
  }
  return map;
}

function bucketize<T extends { created_at: string }>(rows: T[]): Map<string, number> {
  const map = emptyBuckets();
  for (const row of rows) {
    const day = row.created_at.slice(0, 10);
    if (map.has(day)) map.set(day, (map.get(day) ?? 0) + 1);
  }
  return map;
}

function sumBuckets(rows: { created_at: string; amount: number }[]): Map<string, number> {
  const map = emptyBuckets();
  for (const row of rows) {
    const day = row.created_at.slice(0, 10);
    if (map.has(day)) map.set(day, (map.get(day) ?? 0) + row.amount);
  }
  return map;
}

interface UserRef { username: string | null; avatar_url: string | null }

async function loadCharts() {
  const cutoff = new Date(Date.now() - DAYS * MS_DAY).toISOString();

  const [messages, gamesPlayed, txAll, gamesByKey, users, orders, jailsAll] = await Promise.all([
    supabase.from('activity_events').select('created_at').eq('type', 'message').gte('created_at', cutoff).limit(50_000),
    supabase.from('game_players').select('joined_at').gte('joined_at', cutoff).limit(50_000),
    supabase.from('pulse_transactions').select('created_at, amount, type, discord_id').gte('created_at', cutoff).limit(50_000),
    supabase.from('game_sessions').select('game_key, created_at').gte('created_at', cutoff).limit(50_000),
    supabase.from('discord_users').select('discord_id, username, avatar_url, joined_at, balance_pulse').limit(5000),
    supabase.from('orders').select('pulse_spent, item_id, created_at').gte('created_at', cutoff).limit(10_000),
    supabase.from('jailed_members').select('jailed_at').gte('jailed_at', cutoff).limit(10_000),
  ]);

  const msgs = bucketize((messages.data ?? []) as { created_at: string }[]);
  const games = bucketize(
    ((gamesPlayed.data ?? []) as { joined_at: string }[]).map(r => ({ created_at: r.joined_at }))
  );

  // Positive txs = mint / inflow. Negative = burn / spend.
  const tx = (txAll.data ?? []) as { created_at: string; amount: number; type: string; discord_id: string }[];
  const inflow  = sumBuckets(tx.filter(t => t.amount > 0));
  const outflow = sumBuckets(tx.filter(t => t.amount < 0).map(t => ({ ...t, amount: -t.amount })));

  // Member joins per day.
  const joined = bucketize(
    ((users.data ?? []) as { joined_at?: string | null }[])
      .filter(u => u.joined_at)
      .map(u => ({ created_at: (u.joined_at as string).slice(0, 19) })),
  );
  const jails = bucketize(
    ((jailsAll.data ?? []) as { jailed_at: string }[])
      .map(r => ({ created_at: r.jailed_at })),
  );

  // Cumulative PULSE in circulation = running total of net txs day by day.
  const netByDay = emptyBuckets();
  for (const day of netByDay.keys()) {
    const inn = inflow.get(day) ?? 0;
    const out = outflow.get(day) ?? 0;
    netByDay.set(day, inn - out);
  }
  const cum = emptyBuckets();
  const totalInWallets = (users.data ?? []).reduce(
    (s, u) => s + ((u as { balance_pulse?: number }).balance_pulse ?? 0), 0,
  );
  // Anchor "today" at totalInWallets and walk backward for a running curve.
  const days = [...netByDay.keys()];
  let running = totalInWallets;
  for (let i = days.length - 1; i >= 0; i--) {
    cum.set(days[i], running);
    running -= (netByDay.get(days[i]) ?? 0);
  }

  // Aggregate PULSE flow by tx type (which sources & sinks dominate).
  const flowByType = new Map<string, { earned: number; spent: number }>();
  for (const t of tx) {
    const entry = flowByType.get(t.type) ?? { earned: 0, spent: 0 };
    if (t.amount > 0) entry.earned += t.amount;
    else entry.spent += -t.amount;
    flowByType.set(t.type, entry);
  }

  // Top earners and top spenders over the window.
  const perUser = new Map<string, { earned: number; spent: number }>();
  for (const t of tx) {
    const e = perUser.get(t.discord_id) ?? { earned: 0, spent: 0 };
    if (t.amount > 0) e.earned += t.amount;
    else e.spent += -t.amount;
    perUser.set(t.discord_id, e);
  }
  const userMap = new Map<string, UserRef>();
  for (const u of (users.data ?? []) as { discord_id: string; username: string | null; avatar_url: string | null }[]) {
    userMap.set(u.discord_id, { username: u.username, avatar_url: u.avatar_url });
  }
  const topEarners = [...perUser.entries()]
    .map(([id, v]) => ({ id, ...v, ref: userMap.get(id) }))
    .filter(x => x.earned > 0)
    .sort((a, b) => b.earned - a.earned)
    .slice(0, 5);
  const topSpenders = [...perUser.entries()]
    .map(([id, v]) => ({ id, ...v, ref: userMap.get(id) }))
    .filter(x => x.spent > 0)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 5);

  // Games played per game key.
  const gameCounts = new Map<string, number>();
  for (const s of (gamesByKey.data ?? []) as { game_key: string }[]) {
    gameCounts.set(s.game_key, (gameCounts.get(s.game_key) ?? 0) + 1);
  }
  const topGames = [...gameCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const totalMinted = tx.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalBurned = tx.filter(t => t.amount < 0).reduce((s, t) => s + (-t.amount), 0);
  const shopRevenue = (orders.data ?? []).reduce((s, o) => s + ((o as { pulse_spent?: number }).pulse_spent ?? 0), 0);
  const activeMembers = new Set(tx.map(t => t.discord_id)).size;

  return {
    msgs, games, inflow, outflow, cum, joined, jails,
    flowByType, topEarners, topSpenders, topGames,
    totals: {
      minted: totalMinted,
      burned: totalBurned,
      net: totalMinted - totalBurned,
      shopRevenue,
      activeMembers,
      totalMessages: msgs && [...msgs.values()].reduce((s, v) => s + v, 0),
      totalInWallets,
    },
  };
}

// -------- Chart primitives --------

function BarChart({ data, tint, formatValue, height = 24 }: {
  data: Map<string, number>;
  tint: string;
  formatValue?: (n: number) => string;
  height?: number;
}) {
  const entries = [...data.entries()];
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const barW = 100 / entries.length;
  return (
    <div>
      <svg viewBox={`0 0 100 34`} preserveAspectRatio="none" className="w-full" style={{ height: `${height * 4}px` }}>
        {entries.map(([day, val], i) => {
          const h = (val / max) * 32;
          return (
            <rect key={day}
              x={i * barW + 0.4}
              y={32 - h}
              width={barW - 0.8}
              height={h}
              rx={0.6}
              fill={tint}
              opacity={val > 0 ? 0.9 : 0.15}
            />
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

// Two series stacked side-by-side (earn vs burn).
function DualBarChart({ a, b, tintA, tintB, labelA, labelB, formatValue }: {
  a: Map<string, number>;
  b: Map<string, number>;
  tintA: string; tintB: string;
  labelA: string; labelB: string;
  formatValue?: (n: number) => string;
}) {
  const days = [...a.keys()];
  const max = Math.max(1, ...days.map(d => Math.max(a.get(d) ?? 0, b.get(d) ?? 0)));
  const groupW = 100 / days.length;
  const barW = groupW * 0.4;
  const gap = groupW * 0.1;
  return (
    <div>
      <svg viewBox="0 0 100 34" preserveAspectRatio="none" className="w-full h-32">
        {days.map((day, i) => {
          const av = a.get(day) ?? 0;
          const bv = b.get(day) ?? 0;
          const ha = (av / max) * 32;
          const hb = (bv / max) * 32;
          const x = i * groupW + gap / 2;
          return (
            <g key={day}>
              <rect x={x} y={32 - ha} width={barW} height={ha} rx={0.4} fill={tintA} opacity={av > 0 ? 0.9 : 0.15} />
              <rect x={x + barW} y={32 - hb} width={barW} height={hb} rx={0.4} fill={tintB} opacity={bv > 0 ? 0.9 : 0.15} />
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-pulse-mute mt-1">
        <span>{days[0]?.slice(5)}</span>
        <span>{days[days.length - 1]?.slice(5)}</span>
      </div>
      <div className="flex items-center gap-3 text-[11px] mt-2">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded" style={{ background: tintA }} />{labelA}: <b className="text-pulse-text">{formatValue ? formatValue(sum(a)) : sum(a)}</b></span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded" style={{ background: tintB }} />{labelB}: <b className="text-pulse-text">{formatValue ? formatValue(sum(b)) : sum(b)}</b></span>
      </div>
    </div>
  );
}

function LineChart({ data, tint, formatValue }: {
  data: Map<string, number>;
  tint: string;
  formatValue?: (n: number) => string;
}) {
  const entries = [...data.entries()];
  const vals = entries.map(([, v]) => v);
  const max = Math.max(1, ...vals);
  const min = Math.min(...vals);
  const stepX = 100 / (entries.length - 1);
  const path = entries
    .map(([, v], i) => `${i === 0 ? 'M' : 'L'} ${i * stepX} ${32 - ((v - min) / Math.max(1, max - min)) * 32}`)
    .join(' ');
  const areaPath = `${path} L 100 32 L 0 32 Z`;
  return (
    <div>
      <svg viewBox="0 0 100 34" preserveAspectRatio="none" className="w-full h-24">
        <path d={areaPath} fill={tint} opacity="0.2" />
        <path d={path} fill="none" stroke={tint} strokeWidth="0.6" />
        {entries.map(([, v], i) => (
          <circle key={i} cx={i * stepX} cy={32 - ((v - min) / Math.max(1, max - min)) * 32} r="0.7" fill={tint} />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-pulse-mute mt-1">
        <span>Then</span>
        <span>Now</span>
      </div>
      <div className="text-[11px] text-pulse-mute mt-1">
        Now: <span className="text-pulse-gold">{formatValue ? formatValue(vals[vals.length - 1]) : vals[vals.length - 1].toLocaleString('en-US')}</span>
        <span className="mx-1">·</span>
        Peak: {formatValue ? formatValue(max) : max.toLocaleString('en-US')}
      </div>
    </div>
  );
}

function sum(m: Map<string, number>): number {
  let s = 0; for (const v of m.values()) s += v; return s;
}
const fmtPulse = (n: number) => Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toLocaleString('en-US');

// -------- KPI tile --------

function Kpi({ label, value, hint, tint = 'text-pulse-gold' }: { label: string; value: string; hint?: string; tint?: string }) {
  return (
    <div className="bg-pulse-card border border-pulse-border rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-wide text-pulse-mute">{label}</div>
      <div className={`text-xl md:text-2xl font-bold mt-1 ${tint}`}>{value}</div>
      {hint && <div className="text-[10px] text-pulse-mute mt-0.5">{hint}</div>}
    </div>
  );
}

// -------- Page --------

export default async function ChartsPage() {
  const c = await loadCharts();

  return (
    <>
      <BackLink />
      <h1 className="text-xl md:text-2xl font-bold mb-1">📊 Charts &amp; trends</h1>
      <p className="text-pulse-mute mb-4 text-sm">Community pulse — last {DAYS} days.</p>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
        <Kpi label="PULSE minted" value={fmtPulse(c.totals.minted)} hint={`${DAYS}d in`} />
        <Kpi label="PULSE burned" value={fmtPulse(c.totals.burned)} hint={`${DAYS}d out`} tint="text-red-300" />
        <Kpi
          label="Net inflation"
          value={(c.totals.net >= 0 ? '+' : '') + fmtPulse(c.totals.net)}
          hint="minted − burned"
          tint={c.totals.net >= 0 ? 'text-emerald-300' : 'text-red-300'}
        />
        <Kpi label="Active members" value={c.totals.activeMembers.toLocaleString('en-US')} hint="w/ any tx" tint="text-cyan-300" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
        <Kpi label="In wallets" value={fmtPulse(c.totals.totalInWallets)} hint="right now" tint="text-pulse-text" />
        <Kpi label="Shop revenue" value={fmtPulse(c.totals.shopRevenue)} hint="14d SPEND_SHOP" tint="text-pink-300" />
        <Kpi label="Messages" value={c.totals.totalMessages.toLocaleString('en-US')} hint="14d" tint="text-cyan-300" />
        <Kpi label="New members" value={sum(c.joined).toLocaleString('en-US')} hint="14d" tint="text-emerald-300" />
      </div>

      <div className="space-y-4">
        {/* Economy flow — earn vs burn */}
        <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">💸</span>
            <div>
              <div className="font-semibold">Economy flow</div>
              <div className="text-xs text-pulse-mute">PULSE earned vs burned per day</div>
            </div>
          </div>
          <DualBarChart a={c.inflow} b={c.outflow}
            tintA="#22C55E" tintB="#F43F5E"
            labelA="Earned" labelB="Burned"
            formatValue={fmtPulse}
          />
        </div>

        {/* Cumulative PULSE in circulation */}
        <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📈</span>
            <div>
              <div className="font-semibold">PULSE in circulation</div>
              <div className="text-xs text-pulse-mute">Running total in wallets</div>
            </div>
          </div>
          <LineChart data={c.cum} tint="#F5B62E" formatValue={fmtPulse} />
        </div>

        {/* PULSE sources & sinks by type */}
        <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🔥</span>
            <div>
              <div className="font-semibold">Sources &amp; sinks</div>
              <div className="text-xs text-pulse-mute">Where PULSE comes from and goes to</div>
            </div>
          </div>
          <div className="space-y-1.5">
            {[...c.flowByType.entries()].sort((a, b) => (b[1].earned + b[1].spent) - (a[1].earned + a[1].spent)).map(([type, v]) => {
              const total = v.earned + v.spent;
              const maxRow = Math.max(1, ...[...c.flowByType.values()].map(x => x.earned + x.spent));
              const pct = (total / maxRow) * 100;
              const earnRatio = total > 0 ? (v.earned / total) * 100 : 0;
              const meta: Record<string, { emoji: string; label: string }> = {
                EARN_MISSION: { emoji: '🎯', label: 'Missions' },
                EARN_VOICE:   { emoji: '🎤', label: 'Voice' },
                EARN_EVENT:   { emoji: '🎉', label: 'Events / games' },
                ADMIN_GRANT:  { emoji: '💰', label: 'Admin grants' },
                ADMIN_REVOKE: { emoji: '⚖️', label: 'Admin revokes' },
                SPEND_SHOP:   { emoji: '🛍️', label: 'Shop spending' },
                REFUND:       { emoji: '↩️', label: 'Refunds' },
              };
              const m = meta[type] ?? { emoji: '·', label: type };
              return (
                <div key={type} className="flex items-center gap-2">
                  <div className="w-8 text-center">{m.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-pulse-text truncate">{m.label}</span>
                      <span className="text-pulse-mute ml-2">{fmtPulse(total)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-pulse-border/40 overflow-hidden flex" style={{ width: `${pct}%` }}>
                      <div style={{ width: `${earnRatio}%`, background: '#22C55E' }} />
                      <div style={{ width: `${100 - earnRatio}%`, background: '#F43F5E' }} />
                    </div>
                  </div>
                </div>
              );
            })}
            {c.flowByType.size === 0 && <div className="text-xs text-pulse-mute text-center py-2">No transactions yet.</div>}
          </div>
        </div>

        {/* Games popularity */}
        <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🎮</span>
            <div>
              <div className="font-semibold">Most played games</div>
              <div className="text-xs text-pulse-mute">Sessions started in {DAYS} days</div>
            </div>
          </div>
          <div className="space-y-1.5">
            {c.topGames.length === 0 && <div className="text-xs text-pulse-mute text-center py-2">No sessions yet.</div>}
            {c.topGames.map(([key, n]) => {
              const maxN = c.topGames[0][1];
              return (
                <div key={key} className="flex items-center gap-2">
                  <div className="w-24 text-xs text-pulse-mute truncate">{key}</div>
                  <div className="flex-1 h-3 bg-pulse-border/40 rounded-full overflow-hidden">
                    <div className="h-full bg-pulse-gold" style={{ width: `${(n / maxN) * 100}%` }} />
                  </div>
                  <div className="w-10 text-right text-xs font-mono text-pulse-gold">{n}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top earners */}
        <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🥇</span>
            <div>
              <div className="font-semibold">Top earners</div>
              <div className="text-xs text-pulse-mute">Most PULSE earned in {DAYS} days</div>
            </div>
          </div>
          <ul className="space-y-2">
            {c.topEarners.map((u, i) => (
              <li key={u.id} className="flex items-center gap-3">
                <span className="w-6 text-center text-pulse-gold font-bold">{i + 1}</span>
                {u.ref?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.ref.avatar_url} alt="" className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-pulse-border" />
                )}
                <div className="flex-1 min-w-0 text-sm truncate">{u.ref?.username ?? u.id.slice(-6)}</div>
                <div className="text-pulse-gold font-mono">+{fmtPulse(u.earned)}</div>
              </li>
            ))}
            {c.topEarners.length === 0 && <li className="text-xs text-pulse-mute text-center py-2">Nobody earned yet.</li>}
          </ul>
        </div>

        {/* Top spenders */}
        <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">💸</span>
            <div>
              <div className="font-semibold">Top spenders</div>
              <div className="text-xs text-pulse-mute">Most PULSE spent in {DAYS} days</div>
            </div>
          </div>
          <ul className="space-y-2">
            {c.topSpenders.map((u, i) => (
              <li key={u.id} className="flex items-center gap-3">
                <span className="w-6 text-center text-pink-300 font-bold">{i + 1}</span>
                {u.ref?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.ref.avatar_url} alt="" className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-pulse-border" />
                )}
                <div className="flex-1 min-w-0 text-sm truncate">{u.ref?.username ?? u.id.slice(-6)}</div>
                <div className="text-pink-300 font-mono">−{fmtPulse(u.spent)}</div>
              </li>
            ))}
            {c.topSpenders.length === 0 && <li className="text-xs text-pulse-mute text-center py-2">Nobody spent yet.</li>}
          </ul>
        </div>

        {/* Messages */}
        <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">💬</span>
            <div>
              <div className="font-semibold">Messages per day</div>
              <div className="text-xs text-pulse-mute">Every message counted for PULSE</div>
            </div>
          </div>
          <BarChart data={c.msgs} tint="#22D3EE" />
        </div>

        {/* Games played */}
        <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🕹️</span>
            <div>
              <div className="font-semibold">Games played per day</div>
              <div className="text-xs text-pulse-mute">Every entry into a game session</div>
            </div>
          </div>
          <BarChart data={c.games} tint="#A855F7" />
        </div>

        {/* Member growth */}
        <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🌱</span>
            <div>
              <div className="font-semibold">New members</div>
              <div className="text-xs text-pulse-mute">Onboardings per day</div>
            </div>
          </div>
          <BarChart data={c.joined} tint="#22C55E" />
        </div>

        {/* Jails */}
        <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🔒</span>
            <div>
              <div className="font-semibold">Jails per day</div>
              <div className="text-xs text-pulse-mute">Members sent to Fucktowm</div>
            </div>
          </div>
          <BarChart data={c.jails} tint="#F43F5E" />
        </div>
      </div>
    </>
  );
}
