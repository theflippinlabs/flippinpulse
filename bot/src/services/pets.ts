import { supabase } from '../supabase.js';
import { spendPulse } from './economy.js';
import { earnPulse } from './games.js';
import { log } from '../utils/logger.js';

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

export const SPECIES = [
  { key: 'flame_fox',     emoji: '🦊', label: { fr: 'Renard de flammes',    en: 'Flame Fox'     } },
  { key: 'crystal_wolf',  emoji: '🐺', label: { fr: 'Loup de cristal',       en: 'Crystal Wolf'  } },
  { key: 'thunder_kitty', emoji: '⚡', label: { fr: 'Chat foudre',           en: 'Thunder Kitty' } },
  { key: 'shadow_bear',   emoji: '🐻', label: { fr: 'Ours des ombres',       en: 'Shadow Bear'   } },
  { key: 'coral_axolotl', emoji: '🦎', label: { fr: 'Axolotl corail',        en: 'Coral Axolotl' } },
  { key: 'sky_owl',       emoji: '🦉', label: { fr: 'Hibou céleste',         en: 'Sky Owl'       } },
  { key: 'lava_dragon',   emoji: '🐉', label: { fr: 'Dragonneau de lave',    en: 'Lava Dragon'   } },
  { key: 'moon_bunny',    emoji: '🐰', label: { fr: 'Lapin de lune',         en: 'Moon Bunny'    } },
] as const;

export type SpeciesKey = typeof SPECIES[number]['key'];

const ADOPTION_COST = 100;
const FEED_COST = 5;
const PLAY_COST = 0;
const TRAIN_COST = 15;
const FEED_COOLDOWN_MIN = 60;
const PLAY_COOLDOWN_MIN = 60;
const TRAIN_COOLDOWN_MIN = 120;
const BATTLE_COOLDOWN_MIN = 30;
const XP_PER_LEVEL = 100;

// Stats decay by 1 point per hour for hunger and energy, 0.5/h for happiness.
function decayStats(p: Pet): Pet {
  const now = Date.now();
  const last = new Date(p.last_ticked_at).getTime();
  const hours = Math.max(0, (now - last) / 3_600_000);
  if (hours < 1) return p;
  p.hunger = Math.max(0, Math.min(100, Math.round(p.hunger - hours * 1)));
  p.energy = Math.max(0, Math.min(100, Math.round(p.energy - hours * 1)));
  p.happiness = Math.max(0, Math.min(100, Math.round(p.happiness - hours * 0.5)));
  // Very hungry pets lose health
  if (p.hunger < 20) p.health = Math.max(0, Math.round(p.health - hours * 1));
  p.last_ticked_at = new Date(now).toISOString();
  return p;
}

async function saveTicked(p: Pet): Promise<void> {
  await supabase.from('pets')
    .update({ hunger: p.hunger, happiness: p.happiness, energy: p.energy, health: p.health, last_ticked_at: p.last_ticked_at })
    .eq('id', p.id);
}

export async function getActivePet(discordId: string): Promise<Pet | null> {
  const { data } = await supabase.from('pets').select('*').eq('discord_id', discordId).eq('is_active', true).limit(1).maybeSingle();
  if (!data) return null;
  const p = data as Pet;
  const decayed = decayStats({ ...p });
  if (decayed.hunger !== p.hunger || decayed.energy !== p.energy || decayed.happiness !== p.happiness || decayed.health !== p.health) {
    await saveTicked(decayed).catch(err => log('ERROR', 'pet tick save failed', err));
  }
  return decayed;
}

export interface AdoptResult { ok: boolean; pet?: Pet; error?: string; }

export async function adoptPet(discordId: string, speciesKey: SpeciesKey, name: string): Promise<AdoptResult> {
  const existing = await getActivePet(discordId);
  if (existing) return { ok: false, error: 'You already have an active pet. Retire it first.' };
  const species = SPECIES.find(s => s.key === speciesKey);
  if (!species) return { ok: false, error: 'Unknown species.' };
  const trimmed = name.trim().slice(0, 32);
  if (trimmed.length < 2) return { ok: false, error: 'Name too short.' };
  const debit = await spendPulse(discordId, ADOPTION_COST, `Pet adoption: ${trimmed}`);
  if (!debit.success) return { ok: false, error: debit.error ?? 'Cannot debit adoption cost.' };
  const { data, error } = await supabase.from('pets').insert({
    discord_id: discordId, name: trimmed, species: species.key, emoji: species.emoji,
  }).select('*').single();
  if (error || !data) return { ok: false, error: error?.message ?? 'Adoption failed.' };
  return { ok: true, pet: data as Pet };
}

export async function retirePet(discordId: string): Promise<{ ok: boolean; error?: string; refund: number }> {
  const p = await getActivePet(discordId);
  if (!p) return { ok: false, error: 'You have no active pet.', refund: 0 };
  await supabase.from('pets').update({ is_active: false }).eq('id', p.id);
  const refund = Math.floor(ADOPTION_COST / 4);
  await earnPulse(discordId, refund, `Pet retirement: ${p.name}`, `pet:${p.id}`);
  return { ok: true, refund };
}

interface ActionCheck { ok: boolean; error?: string; }

function cooldownGate(lastAt: string | null, mins: number, en: boolean, actionFR: string, actionEN: string): ActionCheck {
  if (!lastAt) return { ok: true };
  const ms = new Date(lastAt).getTime();
  const nextAt = ms + mins * 60_000;
  if (Date.now() >= nextAt) return { ok: true };
  const remaining = Math.ceil((nextAt - Date.now()) / 60_000);
  return { ok: false, error: en ? `You must wait ${remaining} more minutes before you can ${actionEN} again.` : `Attends encore ${remaining} min avant de ${actionFR} à nouveau.` };
}

function gainXP(p: Pet, xp: number): { leveledUp: boolean; toLevel: number } {
  p.xp += xp;
  let leveled = false;
  while (p.xp >= XP_PER_LEVEL) {
    p.xp -= XP_PER_LEVEL;
    p.level += 1;
    leveled = true;
    p.health = Math.min(100, p.health + 10);
  }
  return { leveledUp: leveled, toLevel: p.level };
}

export interface ActionResult { ok: boolean; error?: string; pet?: Pet; leveledUp?: boolean; cost?: number; }

export async function feedPet(discordId: string, en: boolean): Promise<ActionResult> {
  const p = await getActivePet(discordId);
  if (!p) return { ok: false, error: en ? 'You have no pet. Use `/pet adopt` first.' : 'Tu n\'as pas de compagnon. Utilise `/pet adopt`.' };
  const cd = cooldownGate(p.last_fed_at, FEED_COOLDOWN_MIN, en, 'nourrir', 'feed');
  if (!cd.ok) return { ok: false, error: cd.error };
  const debit = await spendPulse(discordId, FEED_COST, `Feed pet ${p.name}`);
  if (!debit.success) return { ok: false, error: debit.error };
  p.hunger = Math.min(100, p.hunger + 30);
  p.happiness = Math.min(100, p.happiness + 5);
  const lvl = gainXP(p, 5);
  p.last_fed_at = new Date().toISOString();
  await supabase.from('pets').update({ hunger: p.hunger, happiness: p.happiness, xp: p.xp, level: p.level, health: p.health, last_fed_at: p.last_fed_at }).eq('id', p.id);
  return { ok: true, pet: p, leveledUp: lvl.leveledUp, cost: FEED_COST };
}

export async function playPet(discordId: string, en: boolean): Promise<ActionResult> {
  const p = await getActivePet(discordId);
  if (!p) return { ok: false, error: en ? 'You have no pet. Use `/pet adopt` first.' : 'Tu n\'as pas de compagnon. Utilise `/pet adopt`.' };
  if (p.energy < 20) return { ok: false, error: en ? `${p.name} is too tired — let them rest.` : `${p.name} est trop fatigué·e — laisse-le·la se reposer.` };
  const cd = cooldownGate(p.last_played_at, PLAY_COOLDOWN_MIN, en, 'jouer', 'play');
  if (!cd.ok) return { ok: false, error: cd.error };
  p.happiness = Math.min(100, p.happiness + 25);
  p.energy = Math.max(0, p.energy - 15);
  const lvl = gainXP(p, 8);
  p.last_played_at = new Date().toISOString();
  await supabase.from('pets').update({ happiness: p.happiness, energy: p.energy, xp: p.xp, level: p.level, health: p.health, last_played_at: p.last_played_at }).eq('id', p.id);
  return { ok: true, pet: p, leveledUp: lvl.leveledUp, cost: PLAY_COST };
}

export async function trainPet(discordId: string, en: boolean): Promise<ActionResult> {
  const p = await getActivePet(discordId);
  if (!p) return { ok: false, error: en ? 'You have no pet. Use `/pet adopt` first.' : 'Tu n\'as pas de compagnon. Utilise `/pet adopt`.' };
  if (p.energy < 30) return { ok: false, error: en ? `${p.name} is too tired to train.` : `${p.name} est trop fatigué·e pour s'entraîner.` };
  const cd = cooldownGate(p.last_trained_at, TRAIN_COOLDOWN_MIN, en, 'entraîner', 'train');
  if (!cd.ok) return { ok: false, error: cd.error };
  const debit = await spendPulse(discordId, TRAIN_COST, `Train pet ${p.name}`);
  if (!debit.success) return { ok: false, error: debit.error };
  p.energy = Math.max(0, p.energy - 20);
  const lvl = gainXP(p, 30);
  p.last_trained_at = new Date().toISOString();
  await supabase.from('pets').update({ energy: p.energy, xp: p.xp, level: p.level, health: p.health, last_trained_at: p.last_trained_at }).eq('id', p.id);
  return { ok: true, pet: p, leveledUp: lvl.leveledUp, cost: TRAIN_COST };
}

// ---- Battles ----
export interface BattleTurn { attacker: string; defender: string; damage: number; move: string; }
export interface BattleResult {
  ok: boolean;
  error?: string;
  winnerId?: number;
  loserId?: number;
  turns: BattleTurn[];
  wager: number;
  payout: number;
}

function rollDamage(atk: Pet, def: Pet): { damage: number; move: string } {
  const base = 6 + atk.level * 2;
  const variance = Math.random() * 6;
  const raw = base + variance - def.level * 0.5;
  const damage = Math.max(1, Math.round(raw));
  const moves = ['charges in', 'lands a critical hit', 'strikes with claws', 'uses a signature move', 'unleashes a burst'];
  return { damage, move: moves[Math.floor(Math.random() * moves.length)] };
}

export async function battlePvE(discordId: string, wager: number, en: boolean): Promise<BattleResult> {
  const p = await getActivePet(discordId);
  if (!p) return { ok: false, error: en ? 'You have no pet.' : 'Pas de compagnon.', turns: [], wager, payout: 0 };
  if (p.energy < 25 || p.health < 40) return { ok: false, error: en ? `${p.name} is not fit to battle.` : `${p.name} n'est pas en état de combattre.`, turns: [], wager, payout: 0 };
  const cd = cooldownGate(p.last_battle_at, BATTLE_COOLDOWN_MIN, en, 'combattre', 'battle');
  if (!cd.ok) return { ok: false, error: cd.error, turns: [], wager, payout: 0 };
  if (wager < 0 || wager > 1000) return { ok: false, error: en ? 'Wager 0-1000 PULSE.' : 'Mise entre 0 et 1000 PULSE.', turns: [], wager, payout: 0 };
  if (wager > 0) {
    const debit = await spendPulse(discordId, wager, `Pet battle wager`);
    if (!debit.success) return { ok: false, error: debit.error, turns: [], wager, payout: 0 };
  }

  // Enemy scales with pet level, with slight underdog bias for the player.
  const enemyLevel = Math.max(1, p.level - 1 + Math.floor(Math.random() * 3));
  const enemy: Pet = { ...p, id: -1, name: 'Wild spirit', level: enemyLevel, health: 40 + enemyLevel * 8 } as Pet;
  let myHP = p.health;
  let enHP = enemy.health;
  const turns: BattleTurn[] = [];
  let turn = 0;
  while (myHP > 0 && enHP > 0 && turn < 20) {
    const attackerIsMe = turn % 2 === 0;
    if (attackerIsMe) {
      const { damage, move } = rollDamage(p, enemy);
      enHP -= damage;
      turns.push({ attacker: p.name, defender: enemy.name, damage, move });
    } else {
      const { damage, move } = rollDamage(enemy, p);
      myHP -= damage;
      turns.push({ attacker: enemy.name, defender: p.name, damage, move });
    }
    turn += 1;
  }

  const won = myHP > 0;
  p.energy = Math.max(0, p.energy - 20);
  p.health = Math.max(1, Math.round(myHP));
  p.last_battle_at = new Date().toISOString();
  const payout = won ? wager * 2 + 20 : 0;
  if (won) {
    p.wins += 1;
    const lvl = gainXP(p, 25);
    void lvl;
    if (payout > 0) await earnPulse(discordId, payout, `Pet battle PvE win: ${p.name}`, `pet:${p.id}`);
  } else {
    p.losses += 1;
  }
  await supabase.from('pets').update({ energy: p.energy, health: p.health, wins: p.wins, losses: p.losses, xp: p.xp, level: p.level, last_battle_at: p.last_battle_at }).eq('id', p.id);
  await supabase.from('pet_battles').insert({ attacker_pet_id: p.id, defender_pet_id: p.id, winner_pet_id: won ? p.id : null, pulse_wagered: wager, log_json: turns });
  return { ok: true, winnerId: won ? p.id : undefined, loserId: won ? undefined : p.id, turns, wager, payout };
}
