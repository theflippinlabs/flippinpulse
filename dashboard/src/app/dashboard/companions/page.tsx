import { supabase } from '@/lib/supabase';
import BackLink from '../BackLink';

export const dynamic = 'force-dynamic';

interface CompanionRow {
  discord_id: string;
  name: string;
  emoji: string;
  persona: string;
  language: 'fr' | 'en';
  is_active: boolean;
  created_at: string;
}

interface MessageCountRow { discord_id: string; count: number; }

async function load() {
  const { data: companions } = await supabase.from('ai_companions').select('*').eq('is_active', true).order('created_at', { ascending: false });
  const rows = (companions ?? []) as CompanionRow[];
  const { data: members } = await supabase.from('discord_users').select('discord_id, username');
  const memberMap = new Map((members ?? []).map(m => [m.discord_id, (m as { username: string }).username]));

  // Message volume per companion (client-side aggregation, since Supabase JS
  // doesn't easily expose group-by counts).
  const { data: msgs } = await supabase.from('ai_companion_messages').select('discord_id').limit(10_000);
  const msgCount = new Map<string, number>();
  for (const m of (msgs ?? [])) msgCount.set(m.discord_id as string, (msgCount.get(m.discord_id as string) ?? 0) + 1);
  const messageRows: MessageCountRow[] = rows.map(r => ({ discord_id: r.discord_id, count: msgCount.get(r.discord_id) ?? 0 }));

  const langCount = { fr: 0, en: 0 };
  for (const r of rows) langCount[r.language] += 1;

  return { rows, memberMap, messageRows, langCount, totalMessages: (msgs ?? []).length };
}

const fmt = (n: number) => n.toLocaleString('en-US');

export default async function CompanionsAdmin() {
  const { rows, memberMap, messageRows, langCount, totalMessages } = await load();

  const chatty = messageRows.sort((a, b) => b.count - a.count).slice(0, 30);

  return (
    <>
      <BackLink />
      <h1 className="text-xl md:text-2xl font-bold mb-2">💫 Compagnons IA</h1>
      <p className="text-pulse-mute text-sm mb-4">Chaque membre peut créer son propre chatbot personnalisé.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Compagnons actifs" value={fmt(rows.length)} />
        <StatCard label="Messages échangés" value={fmt(totalMessages)} />
        <StatCard label="🇫🇷 Français" value={fmt(langCount.fr)} />
        <StatCard label="🇬🇧 Anglais" value={fmt(langCount.en)} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-pulse-card border border-pulse-border rounded-xl p-4">
          <h2 className="font-semibold mb-3">🤖 Compagnons créés</h2>
          <ul className="divide-y divide-pulse-border/60 text-sm">
            {rows.slice(0, 30).map(c => (
              <li key={c.discord_id} className="py-2 flex items-center gap-3">
                <div className="text-2xl">{c.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{c.name} <span className="text-[10px] px-1 py-0.5 rounded bg-pulse-border/40">{c.language.toUpperCase()}</span></div>
                  <div className="text-xs text-pulse-mute truncate">owner: {memberMap.get(c.discord_id) ?? c.discord_id.slice(-6)} · {c.persona.slice(0, 60)}</div>
                </div>
              </li>
            ))}
            {!rows.length && <li className="text-pulse-mute py-3 text-center">Aucun compagnon actif.</li>}
          </ul>
        </div>

        <div className="bg-pulse-card border border-pulse-border rounded-xl p-4">
          <h2 className="font-semibold mb-3">💬 Membres les plus bavards</h2>
          <ul className="divide-y divide-pulse-border/60 text-sm">
            {chatty.map(({ discord_id, count }, i) => (
              <li key={discord_id} className="py-2 flex items-center gap-3">
                <div className="w-6 text-center text-xs text-pulse-mute font-mono">#{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{memberMap.get(discord_id) ?? discord_id.slice(-6)}</div>
                  <div className="text-xs text-pulse-mute font-mono">{count} messages</div>
                </div>
              </li>
            ))}
            {!chatty.length && <li className="text-pulse-mute py-3 text-center">Personne n&apos;a encore causé.</li>}
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
