import { supabase } from './supabase';

export type SpeciesKey = 'flame_fox' | 'crystal_wolf' | 'thunder_kitty' | 'shadow_bear' | 'coral_axolotl' | 'sky_owl' | 'lava_dragon' | 'moon_bunny';

export const SPECIES: { key: SpeciesKey; emoji: string; label: { fr: string; en: string } }[] = [
  { key: 'flame_fox',     emoji: '🦊', label: { fr: 'Renard de flammes',    en: 'Flame Fox'     } },
  { key: 'crystal_wolf',  emoji: '🐺', label: { fr: 'Loup de cristal',       en: 'Crystal Wolf'  } },
  { key: 'thunder_kitty', emoji: '⚡', label: { fr: 'Chat foudre',           en: 'Thunder Kitty' } },
  { key: 'shadow_bear',   emoji: '🐻', label: { fr: 'Ours des ombres',       en: 'Shadow Bear'   } },
  { key: 'coral_axolotl', emoji: '🦎', label: { fr: 'Axolotl corail',        en: 'Coral Axolotl' } },
  { key: 'sky_owl',       emoji: '🦉', label: { fr: 'Hibou céleste',         en: 'Sky Owl'       } },
  { key: 'lava_dragon',   emoji: '🐉', label: { fr: 'Dragonneau de lave',    en: 'Lava Dragon'   } },
  { key: 'moon_bunny',    emoji: '🐰', label: { fr: 'Lapin de lune',         en: 'Moon Bunny'    } },
];

export const ADOPTION_COST = 100;
export const FEED_COST = 5;
export const TRAIN_COST = 15;

export interface Pet {
  id: number;
  discord_id: string;
  name: string;
  species: string;
  emoji: string;
  level: number;
  xp: number;
  hunger: number;
  happiness: number;
  energy: number;
  health: number;
  wins: number;
  losses: number;
  last_fed_at: string | null;
  last_played_at: string | null;
  last_trained_at: string | null;
  last_battle_at: string | null;
  last_ticked_at: string;
  is_active: boolean;
  created_at: string;
}

function decay(p: Pet): Pet {
  const now = Date.now();
  const hours = Math.max(0, (now - new Date(p.last_ticked_at).getTime()) / 3_600_000);
  if (hours < 1) return p;
  const next = { ...p };
  next.hunger = Math.max(0, Math.round(p.hunger - hours * 1));
  next.energy = Math.max(0, Math.round(p.energy - hours * 1));
  next.happiness = Math.max(0, Math.round(p.happiness - hours * 0.5));
  if (next.hunger < 20) next.health = Math.max(0, Math.round(p.health - hours * 1));
  next.last_ticked_at = new Date(now).toISOString();
  return next;
}

export async function getActivePet(discordId: string): Promise<Pet | null> {
  const { data } = await supabase
    .from('pets').select('*').eq('discord_id', discordId).eq('is_active', true).limit(1).maybeSingle();
  if (!data) return null;
  const p = decay(data as Pet);
  if (p.hunger !== data.hunger || p.energy !== data.energy || p.happiness !== data.happiness || p.health !== data.health) {
    await supabase.from('pets').update({
      hunger: p.hunger, energy: p.energy, happiness: p.happiness, health: p.health, last_ticked_at: p.last_ticked_at,
    }).eq('id', p.id).then(() => null, () => null);
  }
  return p;
}

async function debit(discordId: string, amount: number, reason: string): Promise<{ ok: boolean; error?: string }> {
  const { data: u } = await supabase.from('discord_users').select('balance_pulse, lifetime_spent_pulse').eq('discord_id', discordId).single();
  if (!u) return { ok: false, error: 'user_not_found' };
  if (u.balance_pulse < amount) return { ok: false, error: 'insufficient_pulse' };
  const nb = u.balance_pulse - amount;
  await supabase.from('discord_users').update({ balance_pulse: nb, lifetime_spent_pulse: (u.lifetime_spent_pulse ?? 0) + amount }).eq('discord_id', discordId);
  await supabase.from('pulse_transactions').insert({ discord_id: discordId, type: 'SPEND_SHOP', amount: -amount, reason, balance_after: nb });
  return { ok: true };
}

async function credit(discordId: string, amount: number, reason: string): Promise<void> {
  const { data: u } = await supabase.from('discord_users').select('balance_pulse, lifetime_earned_pulse').eq('discord_id', discordId).single();
  const bal = (u?.balance_pulse ?? 0) + amount;
  await supabase.from('discord_users').update({ balance_pulse: bal, lifetime_earned_pulse: (u?.lifetime_earned_pulse ?? 0) + amount }).eq('discord_id', discordId);
  await supabase.from('pulse_transactions').insert({ discord_id: discordId, type: 'EARN_EVENT', amount, reason, balance_after: bal });
}

function gainXP(p: Pet, xp: number): Pet {
  const n = { ...p, xp: p.xp + xp };
  while (n.xp >= 100) { n.xp -= 100; n.level += 1; n.health = Math.min(100, n.health + 10); }
  return n;
}

function cooldownRemaining(iso: string | null, mins: number): number {
  if (!iso) return 0;
  const ready = new Date(iso).getTime() + mins * 60_000;
  return Math.max(0, ready - Date.now());
}

export async function adoptPet(discordId: string, species: SpeciesKey, name: string): Promise<{ ok: boolean; pet?: Pet; error?: string }> {
  const existing = await getActivePet(discordId);
  if (existing) return { ok: false, error: 'already_owns_pet' };
  const sp = SPECIES.find(s => s.key === species);
  if (!sp) return { ok: false, error: 'unknown_species' };
  const trimmed = name.trim().slice(0, 32);
  if (trimmed.length < 2) return { ok: false, error: 'name_too_short' };
  const d = await debit(discordId, ADOPTION_COST, `Pet adoption: ${trimmed}`);
  if (!d.ok) return { ok: false, error: d.error };
  const { data, error } = await supabase.from('pets').insert({ discord_id: discordId, name: trimmed, species: sp.key, emoji: sp.emoji }).select('*').single();
  if (error || !data) return { ok: false, error: error?.message ?? 'adoption_failed' };
  return { ok: true, pet: data as Pet };
}

export async function retirePet(discordId: string): Promise<{ ok: boolean; refund: number; error?: string }> {
  const p = await getActivePet(discordId);
  if (!p) return { ok: false, refund: 0, error: 'no_pet' };
  await supabase.from('pets').update({ is_active: false }).eq('id', p.id);
  const refund = Math.floor(ADOPTION_COST / 4);
  await credit(discordId, refund, `Pet retirement: ${p.name}`);
  return { ok: true, refund };
}

export async function actionOnPet(discordId: string, action: 'feed' | 'play' | 'train'): Promise<{ ok: boolean; pet?: Pet; leveledUp?: boolean; error?: string; cost?: number }> {
  const p = await getActivePet(discordId);
  if (!p) return { ok: false, error: 'no_pet' };
  const prevLevel = p.level;

  if (action === 'feed') {
    if (cooldownRemaining(p.last_fed_at, 60) > 0) return { ok: false, error: 'cooldown' };
    const d = await debit(discordId, FEED_COST, `Feed pet ${p.name}`);
    if (!d.ok) return { ok: false, error: d.error };
    const next = gainXP({ ...p, hunger: Math.min(100, p.hunger + 30), happiness: Math.min(100, p.happiness + 5), last_fed_at: new Date().toISOString() }, 5);
    await supabase.from('pets').update({ hunger: next.hunger, happiness: next.happiness, xp: next.xp, level: next.level, health: next.health, last_fed_at: next.last_fed_at }).eq('id', p.id);
    return { ok: true, pet: next, leveledUp: next.level > prevLevel, cost: FEED_COST };
  }
  if (action === 'play') {
    if (cooldownRemaining(p.last_played_at, 60) > 0) return { ok: false, error: 'cooldown' };
    if (p.energy < 20) return { ok: false, error: 'too_tired' };
    const next = gainXP({ ...p, happiness: Math.min(100, p.happiness + 25), energy: Math.max(0, p.energy - 15), last_played_at: new Date().toISOString() }, 8);
    await supabase.from('pets').update({ happiness: next.happiness, energy: next.energy, xp: next.xp, level: next.level, health: next.health, last_played_at: next.last_played_at }).eq('id', p.id);
    return { ok: true, pet: next, leveledUp: next.level > prevLevel, cost: 0 };
  }
  if (action === 'train') {
    if (cooldownRemaining(p.last_trained_at, 120) > 0) return { ok: false, error: 'cooldown' };
    if (p.energy < 30) return { ok: false, error: 'too_tired' };
    const d = await debit(discordId, TRAIN_COST, `Train pet ${p.name}`);
    if (!d.ok) return { ok: false, error: d.error };
    const next = gainXP({ ...p, energy: Math.max(0, p.energy - 20), last_trained_at: new Date().toISOString() }, 30);
    await supabase.from('pets').update({ energy: next.energy, xp: next.xp, level: next.level, health: next.health, last_trained_at: next.last_trained_at }).eq('id', p.id);
    return { ok: true, pet: next, leveledUp: next.level > prevLevel, cost: TRAIN_COST };
  }
  return { ok: false, error: 'unknown_action' };
}

export async function getRecentBattles(petId: number, limit = 10) {
  const { data } = await supabase
    .from('pet_battles').select('id, winner_pet_id, pulse_wagered, log_json, created_at')
    .or(`attacker_pet_id.eq.${petId},defender_pet_id.eq.${petId}`)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as { id: number; winner_pet_id: number | null; pulse_wagered: number; log_json: unknown; created_at: string }[];
}
