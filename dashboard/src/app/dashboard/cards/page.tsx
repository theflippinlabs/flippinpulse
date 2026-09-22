import { supabase } from '@/lib/supabase';
import BackLink from '../BackLink';

export const dynamic = 'force-dynamic';

interface CardRow {
  id: number;
  code: string;
  name: string;
  emoji: string;
  rarity: string;
  attack: number;
  defense: number;
  speed: number;
}

interface OwnRow { discord_id: string; card_id: number; quantity: number; }

async function load() {
  const [{ data: catalog }, { data: collection }, { data: members }] = await Promise.all([
    supabase.from('tcg_cards').select('*'),
    supabase.from('tcg_collection').select('discord_id, card_id, quantity'),
    supabase.from('discord_users').select('discord_id, username'),
  ]);
  const cards = (catalog ?? []) as CardRow[];
  const rows = (collection ?? []) as OwnRow[];
  const memberMap = new Map((members ?? []).map(m => [m.discord_id, (m as { username: string }).username]));

  const bySpec = new Map<number, number>(); // card_id → total in circulation
  const byOwner = new Map<string, number>(); // discord_id → total unique
  const byOwnerCount = new Map<string, number>(); // discord_id → total cards owned
  for (const r of rows) {
    bySpec.set(r.card_id, (bySpec.get(r.card_id) ?? 0) + r.quantity);
    byOwner.set(r.discord_id, (byOwner.get(r.discord_id) ?? 0) + 1);
    byOwnerCount.set(r.discord_id, (byOwnerCount.get(r.discord_id) ?? 0) + r.quantity);
  }

  const totalInCirc = [...bySpec.values()].reduce((a, b) => a + b, 0);
  const uniqueOwners = byOwner.size;
  const topCollectors = [...byOwner.entries()]
    .sort((a, b) => b[1] - a[1] || (byOwnerCount.get(b[0]) ?? 0) - (byOwnerCount.get(a[0]) ?? 0))
    .slice(0, 30);
  const cardStats = cards.map(c => ({ card: c, count: bySpec.get(c.id) ?? 0 }))
    .sort((a, b) => a.count - b.count);
  const rarest = cardStats.slice(0, 8);

  return { cards, memberMap, totalInCirc, uniqueOwners, topCollectors, byOwnerCount, rarest, catalogSize: cards.length };
}

const fmt = (n: number) => n.toLocaleString('en-US');

export default async function CardsAdmin() {
  const { memberMap, totalInCirc, uniqueOwners, topCollectors, byOwnerCount, rarest, catalogSize } = await load();

  return (
    <>
      <BackLink />
      <h1 className="text-xl md:text-2xl font-bold mb-2">🎴 Cartes à collectionner</h1>
      <p className="text-pulse-mute text-sm mb-4">Booster · Vente · Fusion · Défis PvP.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Cartes en circulation" value={fmt(totalInCirc)} />
        <StatCard label="Catalogue" value={fmt(catalogSize)} hint="cartes uniques" />
        <StatCard label="Collectionneurs" value={fmt(uniqueOwners)} />
        <StatCard label="Ratio moyen" value={String(uniqueOwners ? Math.round(totalInCirc / uniqueOwners) : 0)} hint="cartes / joueur" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-pulse-card border border-pulse-border rounded-xl p-4">
          <h2 className="font-semibold mb-3">🏆 Top 30 collectionneurs</h2>
          <ul className="divide-y divide-pulse-border/60 text-sm">
            {topCollectors.map(([discordId, unique], i) => (
              <li key={discordId} className="py-2 flex items-center gap-3">
                <div className="w-6 text-center text-xs text-pulse-mute font-mono">#{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{memberMap.get(discordId) ?? discordId.slice(-6)}</div>
                  <div className="text-xs text-pulse-mute font-mono">{unique} uniques · {byOwnerCount.get(discordId) ?? 0} au total</div>
                </div>
              </li>
            ))}
            {!topCollectors.length && <li className="text-pulse-mute py-3 text-center">Personne ne collecte encore.</li>}
          </ul>
        </div>

        <div className="bg-pulse-card border border-pulse-border rounded-xl p-4">
          <h2 className="font-semibold mb-3">🎯 Cartes les plus rares (en circulation)</h2>
          <ul className="divide-y divide-pulse-border/60 text-sm">
            {rarest.map(({ card, count }) => (
              <li key={card.id} className="py-2 flex items-center gap-3">
                <div className="text-xl">{card.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{card.name}</div>
                  <div className="text-xs text-pulse-mute font-mono">{card.rarity} · code {card.code}</div>
                </div>
                <div className="text-sm font-mono text-pulse-gold shrink-0">×{count}</div>
              </li>
            ))}
          </ul>
        </div>
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
