import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface Giveaway {
  id: string;
  prize: string;
  prize_pulse: number | null;
  winners_count: number;
  status: 'active' | 'ended' | 'cancelled';
  end_at: string;
  channel_id: string;
  message_id: string | null;
}

async function load(): Promise<Giveaway[]> {
  const { data } = await supabase
    .from('giveaways')
    .select('id, prize, prize_pulse, winners_count, status, end_at, channel_id, message_id')
    .in('status', ['active', 'ended'])
    .order('created_at', { ascending: false })
    .limit(20);
  return (data ?? []) as Giveaway[];
}

const fmt = (n: number) => n.toLocaleString('en-US');

export default async function GiveawaysPage() {
  const session = getSession();
  if (!session) redirect('/');
  const items = await load();
  const active = items.filter(i => i.status === 'active');
  const ended  = items.filter(i => i.status !== 'active').slice(0, 6);

  return (
    <>
      <Link href="/app" className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold mb-3">
        <span className="text-lg leading-none">‹</span>
        <span>Retour</span>
      </Link>
      <h1 className="text-2xl font-bold mb-1">🎉 Giveaways</h1>
      <p className="text-pulse-mute text-sm mb-4">Participe directement depuis Discord en cliquant sur le bouton Entrer sous l&apos;annonce.</p>

      {!active.length && (
        <div className="bg-pulse-card border border-pulse-border rounded-xl p-6 text-center mb-6">
          <div className="text-4xl mb-2">🎉</div>
          <div className="font-semibold">Pas de giveaway actif</div>
          <div className="text-sm text-pulse-mute mt-1">Reviens plus tard — un Lord peut en lancer à tout moment.</div>
        </div>
      )}

      {active.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs uppercase text-pulse-mute tracking-wide mb-2">En cours</h2>
          <div className="space-y-2.5">
            {active.map(g => (
              <div key={g.id} className="bg-gradient-to-br from-pulse-gold/20 to-pulse-gold/5 border border-pulse-gold/40 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold">{g.prize}</div>
                    <div className="text-xs text-pulse-mute mt-0.5">
                      {g.winners_count} gagnant{g.winners_count > 1 ? 's' : ''}
                      {g.prize_pulse ? ` · ${fmt(g.prize_pulse)} PULSE chacun` : ''}
                    </div>
                    <div className="text-xs text-pulse-mute mt-1">
                      Fin : {new Date(g.end_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div className="text-2xl">⏳</div>
                </div>
                {g.message_id && (
                  <a
                    href={`https://discord.com/channels/@me/${g.channel_id}/${g.message_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block mt-3 py-2 rounded-lg bg-pulse-gold text-black font-bold text-sm text-center shadow-brand"
                  >
                    🎉 Participer sur Discord
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {ended.length > 0 && (
        <section>
          <h2 className="text-xs uppercase text-pulse-mute tracking-wide mb-2">Terminés</h2>
          <ul className="space-y-2">
            {ended.map(g => (
              <li key={g.id} className="bg-pulse-card border border-pulse-border rounded-xl p-3 flex items-center gap-3">
                <div className="text-xl">✅</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{g.prize}</div>
                  <div className="text-xs text-pulse-mute">
                    {g.winners_count} gagnant{g.winners_count > 1 ? 's' : ''}
                    {g.prize_pulse ? ` · ${fmt(g.prize_pulse)} PULSE` : ''}
                    {' · '}{new Date(g.end_at).toLocaleDateString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
