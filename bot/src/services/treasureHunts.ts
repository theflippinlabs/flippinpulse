import { supabase } from '../supabase.js';
import { earnPulse } from './games.js';

export interface TreasureHunt {
  id: number;
  clue: string;
  answer: string;
  reward_pulse: number;
  channel_id: string | null;
  created_by: string;
  winner_id: string | null;
  status: 'active' | 'solved' | 'cancelled';
  starts_at: string;
  ends_at: string | null;
  solved_at: string | null;
}

function normalize(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ');
}

export async function createHunt(input: {
  clue: string; answer: string; rewardPulse: number; channelId: string | null; createdBy: string; endsAt?: Date | null;
}): Promise<{ ok: boolean; error?: string; hunt?: TreasureHunt }> {
  const { data, error } = await supabase.from('treasure_hunts').insert({
    clue: input.clue.slice(0, 500),
    answer: normalize(input.answer),
    reward_pulse: Math.max(1, Math.floor(input.rewardPulse)),
    channel_id: input.channelId,
    created_by: input.createdBy,
    ends_at: input.endsAt ? input.endsAt.toISOString() : null,
  }).select('*').single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };
  return { ok: true, hunt: data as TreasureHunt };
}

export async function activeHunts(channelId?: string): Promise<TreasureHunt[]> {
  let q = supabase.from('treasure_hunts').select('*').eq('status', 'active');
  if (channelId) q = q.eq('channel_id', channelId);
  const { data } = await q.order('id', { ascending: false }).limit(10);
  return (data ?? []) as TreasureHunt[];
}

export async function attemptSolve(discordId: string, guess: string, channelId?: string): Promise<{
  ok: boolean; error?: string; hunt?: TreasureHunt; reward?: number;
}> {
  const g = normalize(guess);
  if (!g) return { ok: false, error: 'empty_guess' };
  let q = supabase.from('treasure_hunts').select('*').eq('status', 'active').eq('answer', g);
  if (channelId) q = q.eq('channel_id', channelId);
  const { data: hunts } = await q.limit(1);
  const hunt = ((hunts ?? [])[0] as TreasureHunt | undefined);
  if (!hunt) return { ok: false, error: 'no_match' };

  // Race-safe finalize: update only if still active. If someone else claimed
  // in the same instant, our update touches zero rows and we return already_solved.
  const { data: updated } = await supabase
    .from('treasure_hunts')
    .update({ status: 'solved', winner_id: discordId, solved_at: new Date().toISOString() })
    .eq('id', hunt.id)
    .eq('status', 'active')
    .select('*')
    .maybeSingle();
  if (!updated) return { ok: false, error: 'already_solved' };
  await earnPulse(discordId, hunt.reward_pulse, `Treasure hunt #${hunt.id} solved`, `treasure:${hunt.id}`);
  return { ok: true, hunt: updated as TreasureHunt, reward: hunt.reward_pulse };
}

export async function cancelHunt(id: number, byUserId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: hunt } = await supabase.from('treasure_hunts').select('*').eq('id', id).maybeSingle();
  if (!hunt) return { ok: false, error: 'not_found' };
  if ((hunt as TreasureHunt).created_by !== byUserId) return { ok: false, error: 'not_owner' };
  if ((hunt as TreasureHunt).status !== 'active') return { ok: false, error: 'not_active' };
  await supabase.from('treasure_hunts').update({ status: 'cancelled' }).eq('id', id);
  return { ok: true };
}
