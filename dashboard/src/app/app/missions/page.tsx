import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface Mission {
  id: string;
  kind: string | null;
  title: string;
  description: string;
  metric: string | null;
  goal: number | null;
  reward_pulse: number;
  status: string;
  end_at: string | null;
}

async function load(): Promise<Mission[]> {
  const { data } = await supabase
    .from('pulse_challenges')
    .select('id, kind, title, description, metric, goal, reward_pulse, status, end_at')
    .eq('status', 'active')
    .order('reward_pulse', { ascending: false });
  return (data ?? []) as Mission[];
}

const KIND_ICON: Record<string, string> = {
  flash: '⚡', riddle: '🧩', daily: '📅', weekly: '📆', objective: '🎯',
};

const fmt = (n: number) => n.toLocaleString('en-US');

export default async function MissionsPage() {
  const session = getSession();
  if (!session) redirect('/');
  const missions = await load();

  return (
    <>
      <Link href="/app" className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold mb-3">
        <span className="text-lg leading-none">‹</span>
        <span>Retour</span>
      </Link>
      <h1 className="text-2xl font-bold mb-1">🎯 Missions</h1>
      <p className="text-pulse-mute text-sm mb-4">Ces missions se jouent sur Discord. La complétion crédite le PULSE automatiquement.</p>

      {!missions.length ? (
        <div className="bg-pulse-card border border-pulse-border rounded-xl p-6 text-center">
          <div className="text-4xl mb-2">🎯</div>
          <div className="font-semibold">Pas de mission active</div>
          <div className="text-sm text-pulse-mute mt-1">Reviens plus tard — un Lord peut en lancer à tout moment.</div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {missions.map(m => {
            const emoji = KIND_ICON[m.kind ?? ''] ?? '🎯';
            return (
              <div key={m.id} className="bg-pulse-card border border-pulse-border rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-pulse-gold/20 flex items-center justify-center text-xl shrink-0">
                    {emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{m.title}</div>
                    <div className="text-xs text-pulse-mute mt-0.5">{m.description}</div>
                    <div className="flex items-center gap-2 mt-2 text-[10px] uppercase">
                      {m.kind && <span className="px-1.5 py-0.5 rounded bg-pulse-border/40 text-pulse-mute">{m.kind}</span>}
                      {m.metric && m.goal && (
                        <span className="px-1.5 py-0.5 rounded bg-pulse-border/40 text-pulse-mute">
                          Objectif : {m.goal} {m.metric}
                        </span>
                      )}
                      {m.end_at && (
                        <span className="px-1.5 py-0.5 rounded bg-pulse-border/40 text-pulse-mute">
                          Fin : {new Date(m.end_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold text-pulse-gold">+{fmt(m.reward_pulse)}</div>
                    <div className="text-[9px] uppercase text-pulse-mute">PULSE</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
