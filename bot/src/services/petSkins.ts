import { supabase } from '../supabase.js';
import { spendPulse } from './economy.js';
import { getActivePet } from './pets.js';

export interface PetSkin {
  id: number;
  code: string;
  name: string;
  emoji_override: string | null;
  aura_hex: string;
  price_pulse: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
  is_active: boolean;
}

export async function listSkins(): Promise<PetSkin[]> {
  const { data } = await supabase.from('pet_skins').select('*').eq('is_active', true).order('price_pulse', { ascending: true });
  return (data ?? []) as PetSkin[];
}

export async function getOwnedSkins(discordId: string): Promise<Set<number>> {
  const { data } = await supabase.from('pet_skin_ownership').select('skin_id').eq('discord_id', discordId);
  return new Set((data ?? []).map(r => r.skin_id as number));
}

export async function buySkin(discordId: string, code: string): Promise<{ ok: boolean; error?: string; skin?: PetSkin }> {
  const { data: skin } = await supabase.from('pet_skins').select('*').eq('code', code).eq('is_active', true).maybeSingle();
  if (!skin) return { ok: false, error: 'skin_not_found' };
  const owned = await getOwnedSkins(discordId);
  if (owned.has((skin as PetSkin).id)) return { ok: false, error: 'already_owned' };
  const debit = await spendPulse(discordId, (skin as PetSkin).price_pulse, `Pet skin: ${(skin as PetSkin).name}`);
  if (!debit.success) return { ok: false, error: debit.error ?? 'debit_failed' };
  await supabase.from('pet_skin_ownership').insert({ discord_id: discordId, skin_id: (skin as PetSkin).id });
  return { ok: true, skin: skin as PetSkin };
}

export async function equipSkin(discordId: string, code: string | null): Promise<{ ok: boolean; error?: string; skin?: PetSkin | null }> {
  const pet = await getActivePet(discordId);
  if (!pet) return { ok: false, error: 'no_pet' };
  if (code === null) {
    await supabase.from('pets').update({ equipped_skin_id: null }).eq('id', pet.id);
    return { ok: true, skin: null };
  }
  const { data: skin } = await supabase.from('pet_skins').select('*').eq('code', code).eq('is_active', true).maybeSingle();
  if (!skin) return { ok: false, error: 'skin_not_found' };
  const owned = await getOwnedSkins(discordId);
  if (!owned.has((skin as PetSkin).id)) return { ok: false, error: 'not_owned' };
  await supabase.from('pets').update({ equipped_skin_id: (skin as PetSkin).id }).eq('id', pet.id);
  return { ok: true, skin: skin as PetSkin };
}

export async function getEquippedSkin(discordId: string): Promise<PetSkin | null> {
  const pet = await getActivePet(discordId);
  if (!pet) return null;
  const eqId = (pet as unknown as { equipped_skin_id?: number | null }).equipped_skin_id;
  if (!eqId) return null;
  const { data } = await supabase.from('pet_skins').select('*').eq('id', eqId).maybeSingle();
  return (data as PetSkin) ?? null;
}

