import { supabase } from '@/lib/supabase';
import BackLink from '../BackLink';

export const dynamic = 'force-dynamic';

interface PetRow {
  id: number;
  discord_id: string;
  name: string;
  species: string;
  emoji: string;
  level: number;
  wins: number;
  losses: number;
  is_active: boolean;
  created_at: string;
}

async function load() {
  const [petsRes, battlesRes, membersRes] = await Promise.all([
    supabase.from('pets').select('*', { count: 'exact' }).eq('is_active', true).order('level', { ascending: false }).limit(50),
    supabase.from('pet_battles').select('*', { count: 'exact', head: true }),
    supabase.from('discord_users').select('discord_id, username'),
  ]);
  const rows = (petsRes.data ?? []) as PetRow[];
  const memberMap = new Map((membersRes.data ?? []).map(m => [m.discord_id, (m as { username: string }).username]));
  const bySpecies = new Map<string, number>();
  for (const p of rows) bySpecies.set(p.species, (bySpecies.get(p.species) ?? 0) + 1);
  return { rows, memberMap, total: petsRes.count ?? 0, battlesTotal: battlesRes.count ?? 0, bySpecies };
}

const fmt = (n: number) => n.toLocaleString('en-US');

export default async function PetsAdmin() {
  const { rows, memberMap, total, battlesTotal, bySpecies } = await load();

  return (
    <>
      <BackLink />
      <h1 className="text-xl md:text-2xl font-bold mb-2">🐾 Compagnons</h1>
      <p className="text-pulse-mute text-sm mb-4">Adoption, entraînement, combats PvE / PvP.</p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        <StatCard label="Compagnons actifs" value={fmt(total)} />
        <StatCard label="Combats totaux" value={fmt(battlesTotal)} />
        <StatCard label="Espèce top" value={[...bySpecies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'} />
      </div>

      <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 md:p-5 mb-5">
        <h2 className="font-semibold mb-3">📊 Espèces adoptées</h2>
        <ul className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[...bySpecies.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <li key={k} className="rounded-lg bg-pulse-bg/60 border border-pulse-border/60 p-2 text-center">
              <div className="text-xs text-pulse-mute">{k}</div>
              <div className="text-xl font-bold text-pulse-gold">{v}</div>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 md:p-5">
        <h2 className="font-semibold mb-3">🏆 Top 50 par niveau</h2>
        <ul className="divide-y divide-pulse-border/60">
          {rows.map((p, i) => (
            <li key={p.id} className="py-2 flex items-center gap-3">
              <div className="w-6 text-center text-xs text-pulse-mute font-mono">#{i + 1}</div>
              <div className="text-2xl">{p.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{p.name}</div>
                <div className="text-xs text-pulse-mute font-mono">Lv.{p.level} · {p.wins}W {p.losses}L · owner: {memberMap.get(p.discord_id) ?? p.discord_id.slice(-6)}</div>
              </div>
            </li>
          ))}
          {!rows.length && <li className="text-pulse-mute text-sm text-center py-4">Aucun compagnon actif.</li>}
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
