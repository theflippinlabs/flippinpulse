import { supabase } from '@/lib/supabase';
import BackLink from '../BackLink';

export const dynamic = 'force-dynamic';

interface Season {
  id: number;
  name: string;
  emoji: string;
  color: number;
  xp_per_tier: number;
  tier_count: number;
  premium_price_pulse: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

interface ProgressRow {
  discord_id: string;
  season_id: number;
  xp: number;
  is_premium: boolean;
  claimed_free: number[];
  claimed_premium: number[];
}

async function load() {
  const { data: season } = await supabase
    .from('battle_pass_seasons')
    .select('*').eq('is_active', true).order('id', { ascending: false }).limit(1).maybeSingle();
  const seasonRow = season as Season | null;
  if (!seasonRow) return null;
  const [{ data: progress }, { data: members }] = await Promise.all([
    supabase.from('battle_pass_progress').select('*').eq('season_id', seasonRow.id).order('xp', { ascending: false }).limit(50),
    supabase.from('discord_users').select('discord_id, username, avatar_url'),
  ]);
  const memberMap = new Map((members ?? []).map(m => [m.discord_id, m as { username: string; avatar_url: string | null }]));
  const rows = (progress ?? []) as ProgressRow[];
  const premiumCount = rows.filter(r => r.is_premium).length;
  const revenue = premiumCount * seasonRow.premium_price_pulse;
  const totalXP = rows.reduce((a, r) => a + r.xp, 0);
  const avgTier = rows.length ? Math.round(totalXP / rows.length / seasonRow.xp_per_tier) : 0;
  return { season: seasonRow, rows, memberMap, premiumCount, revenue, avgTier };
}

const fmt = (n: number) => n.toLocaleString('en-US');

export default async function BattlePassAdmin() {
  const data = await load();
  if (!data) {
    return (
      <>
        <BackLink />
        <h1 className="text-xl md:text-2xl font-bold mb-2">🎫 Battle Pass</h1>
        <p className="text-pulse-mute text-sm">Aucune saison active. Crée-en une dans Supabase pour démarrer.</p>
      </>
    );
  }
  const { season, rows, memberMap, premiumCount, revenue, avgTier } = data;
  const endsIn = Math.max(0, new Date(season.ends_at).getTime() - Date.now());
  const days = Math.floor(endsIn / 86_400_000);

  return (
    <>
      <BackLink />
      <h1 className="text-xl md:text-2xl font-bold mb-2">
        {season.emoji} Battle Pass — <span className="text-pulse-gold">{season.name}</span>
      </h1>
      <p className="text-pulse-mute mb-4 text-sm">
        Termine dans <span className="text-pulse-gold">{days}j</span> · {season.tier_count} paliers · {season.xp_per_tier} XP/palier
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Participants" value={fmt(rows.length)} />
        <StatCard label="Premium débloqué" value={fmt(premiumCount)} hint={`${rows.length ? Math.round((premiumCount / rows.length) * 100) : 0}%`} />
        <StatCard label="Revenu premium (PULSE)" value={fmt(revenue)} />
        <StatCard label="Palier moyen" value={String(avgTier)} hint={`/${season.tier_count}`} />
      </div>

      <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 md:p-5">
        <h2 className="font-semibold mb-3">🏆 Top 50 par XP</h2>
        <ul className="divide-y divide-pulse-border/60">
          {rows.map((r, i) => {
            const member = memberMap.get(r.discord_id);
            const tier = Math.min(season.tier_count, Math.floor(r.xp / season.xp_per_tier));
            return (
              <li key={r.discord_id} className="py-2 flex items-center gap-3">
                <div className="w-6 text-center text-xs text-pulse-mute font-mono">#{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">
                    {member?.username || r.discord_id.slice(-6)}
                    {r.is_premium && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-pulse-gold/20 text-pulse-gold border border-pulse-gold/40">💎 PREMIUM</span>}
                  </div>
                  <div className="text-xs text-pulse-mute font-mono">Tier {tier} · {fmt(r.xp)} XP · {r.claimed_free.length + r.claimed_premium.length} réclamés</div>
                </div>
              </li>
            );
          })}
          {!rows.length && <li className="text-pulse-mute text-sm text-center py-4">Personne n&apos;a encore d&apos;XP.</li>}
        </ul>
      </div>
    </>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-pulse-card border border-pulse-border rounded-xl p-3 md:p-4">
      <div className="text-[10px] uppercase tracking-wide text-pulse-mute">{label}</div>
      <div className="mt-1 text-xl md:text-2xl font-bold text-pulse-gold">{value}</div>
      {hint && <div className="text-[10px] text-pulse-mute mt-0.5">{hint}</div>}
    </div>
  );
}
