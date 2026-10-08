import { supabase } from './supabase';
import { atomicSpend } from './atomicPulse';
import {
  BASE_UNLOCKED_SLOTS,
  EQUIPMENT_SLOTS,
  SLOT_UNLOCK_COST,
  type EquipmentSlot,
} from './tcgShared';

/**
 * Which equipment slots the given member can use. Everyone starts with
 * BASE_UNLOCKED_SLOTS; the rest are stored in tcg_slot_unlocks.
 */
export async function getUnlockedSlots(discordId: string): Promise<EquipmentSlot[]> {
  const { data } = await supabase
    .from('tcg_slot_unlocks')
    .select('slot')
    .eq('discord_id', discordId);
  const purchased = (data ?? [])
    .map(r => r.slot as EquipmentSlot)
    .filter(s => EQUIPMENT_SLOTS.includes(s));
  // Dedup and keep the canonical EQUIPMENT_SLOTS ordering.
  const owned = new Set<EquipmentSlot>([...BASE_UNLOCKED_SLOTS, ...purchased]);
  return EQUIPMENT_SLOTS.filter(s => owned.has(s));
}

export async function unlockSlot(
  discordId: string,
  slot: EquipmentSlot,
): Promise<{ ok: boolean; error?: string; cost?: number; unlocked?: EquipmentSlot[] }> {
  if (!EQUIPMENT_SLOTS.includes(slot)) return { ok: false, error: 'bad_slot' };
  if (BASE_UNLOCKED_SLOTS.includes(slot)) return { ok: false, error: 'already_unlocked' };
  const current = await getUnlockedSlots(discordId);
  if (current.includes(slot)) return { ok: false, error: 'already_unlocked' };
  const cost = SLOT_UNLOCK_COST[slot];
  if (!cost || cost <= 0) return { ok: false, error: 'bad_slot' };

  const spent = await atomicSpend(discordId, cost, `Unlock slot ${slot}`);
  if (!spent.ok) return { ok: false, error: spent.error ?? 'spend_failed' };

  const { error } = await supabase
    .from('tcg_slot_unlocks')
    .insert({ discord_id: discordId, slot });
  if (error) {
    // Best-effort: a conflict means another concurrent request already
    // unlocked it. Treat as success rather than losing the PULSE.
    if (!error.message.includes('duplicate key')) {
      return { ok: false, error: error.message };
    }
  }
  return { ok: true, cost, unlocked: await getUnlockedSlots(discordId) };
}
