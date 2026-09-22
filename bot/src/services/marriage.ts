import { supabase } from '../supabase.js';
import { spendPulse } from './economy.js';
import { earnPulse } from './games.js';

const RING_COST = 500;
const DIVORCE_FEE = 200;

// Marriages are stored with member_a < member_b (string compare) so we always
// have a canonical row per couple regardless of who proposed.
function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export interface MarriageStatus { partnerId: string; wedding_date: string; }

export async function currentMarriage(discordId: string): Promise<MarriageStatus | null> {
  const { data } = await supabase
    .from('marriages')
    .select('member_a, member_b, wedding_date')
    .eq('status', 'active')
    .or(`member_a.eq.${discordId},member_b.eq.${discordId}`)
    .maybeSingle();
  if (!data) return null;
  const partnerId = data.member_a === discordId ? data.member_b : data.member_a;
  return { partnerId, wedding_date: data.wedding_date as string };
}

export interface ProposeResult { ok: boolean; error?: string; proposalId?: number; }

export async function propose(proposerId: string, targetId: string, ringMessage: string): Promise<ProposeResult> {
  if (proposerId === targetId) return { ok: false, error: 'self_propose' };
  const [existingA, existingB] = await Promise.all([currentMarriage(proposerId), currentMarriage(targetId)]);
  if (existingA) return { ok: false, error: 'already_married_proposer' };
  if (existingB) return { ok: false, error: 'already_married_target' };

  // One pending proposal per direction is fine, but not both directions at once.
  const { data: existing } = await supabase
    .from('marriage_proposals')
    .select('id')
    .eq('status', 'pending')
    .or(`and(proposer_id.eq.${proposerId},target_id.eq.${targetId}),and(proposer_id.eq.${targetId},target_id.eq.${proposerId})`)
    .maybeSingle();
  if (existing) return { ok: false, error: 'pending_proposal' };

  const debit = await spendPulse(proposerId, RING_COST, `Marriage ring for ${targetId}`);
  if (!debit.success) return { ok: false, error: debit.error ?? 'debit_failed' };

  const { data, error } = await supabase.from('marriage_proposals').insert({
    proposer_id: proposerId, target_id: targetId, ring_message: ringMessage.slice(0, 200),
  }).select('id').single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };
  return { ok: true, proposalId: data.id as number };
}

export async function getProposal(id: number) {
  const { data } = await supabase.from('marriage_proposals').select('*').eq('id', id).maybeSingle();
  return data as { id: number; proposer_id: string; target_id: string; ring_message: string; status: string } | null;
}

export async function acceptProposal(id: number, byUserId: string): Promise<{ ok: boolean; error?: string; partnerId?: string }> {
  const p = await getProposal(id);
  if (!p || p.status !== 'pending') return { ok: false, error: 'not_pending' };
  if (byUserId !== p.target_id) return { ok: false, error: 'not_target' };
  const [a, b] = canonicalPair(p.proposer_id, p.target_id);
  const { error } = await supabase.from('marriages').insert({ member_a: a, member_b: b });
  if (error) return { ok: false, error: error.message };
  await supabase.from('marriage_proposals').update({ status: 'accepted', resolved_at: new Date().toISOString() }).eq('id', id);
  return { ok: true, partnerId: p.proposer_id };
}

export async function declineProposal(id: number, byUserId: string): Promise<{ ok: boolean; error?: string; refundedTo?: string }> {
  const p = await getProposal(id);
  if (!p || p.status !== 'pending') return { ok: false, error: 'not_pending' };
  if (byUserId !== p.target_id && byUserId !== p.proposer_id) return { ok: false, error: 'not_yours' };
  // Refund the ring cost to the proposer.
  await earnPulse(p.proposer_id, RING_COST, `Marriage ring refund`, `marriage_prop:${id}`);
  await supabase.from('marriage_proposals').update({ status: 'declined', resolved_at: new Date().toISOString() }).eq('id', id);
  return { ok: true, refundedTo: p.proposer_id };
}

export async function divorce(discordId: string): Promise<{ ok: boolean; error?: string; partnerId?: string }> {
  const cur = await currentMarriage(discordId);
  if (!cur) return { ok: false, error: 'not_married' };
  const debit = await spendPulse(discordId, DIVORCE_FEE, `Divorce fee`);
  if (!debit.success) return { ok: false, error: debit.error ?? 'debit_failed' };
  const [a, b] = canonicalPair(discordId, cur.partnerId);
  await supabase.from('marriages').update({
    status: 'ended', ended_at: new Date().toISOString(), end_reason: 'divorce_by_' + discordId,
  }).eq('member_a', a).eq('member_b', b).eq('status', 'active');
  return { ok: true, partnerId: cur.partnerId };
}

export const MARRIAGE_CONSTS = { RING_COST, DIVORCE_FEE };
