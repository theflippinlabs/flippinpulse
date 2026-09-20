import { supabase } from './supabase';

export type ShopCategory = 'role' | 'perk' | 'ticket' | 'cosmetic' | 'irl';

// metadata_json flags a purchase-time effect the shop server handles by
// itself, so the admin never has to touch a single order.
//   { mystery: { min, max } } → rolls a random PULSE amount and credits it
//     back to the buyer immediately (net gain is roll - price).
export interface ShopItemMetadata {
  mystery?: { min: number; max: number };
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  category: ShopCategory;
  price_pulse: number;
  stock_total: number | null;
  stock_remaining: number | null;
  max_per_user: number | null;
  cooldown_hours: number | null;
  is_active: boolean;
  auto_apply: boolean;
  image_url: string | null;
  metadata_json: ShopItemMetadata | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  discord_id: string;
  item_id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'FULFILLED';
  pulse_spent: number;
  notes: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function loadItems(includeInactive = false): Promise<ShopItem[]> {
  const q = supabase
    .from('shop_items')
    .select('id, name, description, category, price_pulse, stock_total, stock_remaining, max_per_user, cooldown_hours, is_active, auto_apply, image_url, metadata_json, created_at, updated_at')
    .order('category', { ascending: true })
    .order('price_pulse', { ascending: true });
  const { data } = includeInactive ? await q : await q.eq('is_active', true);
  return (data ?? []) as ShopItem[];
}

// Purchase an item on behalf of the caller. Mirrors the bot's `/buy` command:
// checks stock, per-user cap, deducts PULSE, decrements stock, creates the
// order + purchase rows atomically enough for a single-admin community.
export async function purchase(
  discordId: string,
  itemId: string,
): Promise<{ ok: true; newBalance: number; orderStatus: string; mysteryReward?: number } | { ok: false; error: string }> {
  const { data: itemRaw } = await supabase
    .from('shop_items').select('*').eq('id', itemId).maybeSingle();
  const item = itemRaw as ShopItem | null;
  if (!item) return { ok: false, error: 'Article introuvable.' };
  if (!item.is_active) return { ok: false, error: 'Article désactivé.' };
  if (item.stock_remaining !== null && item.stock_remaining <= 0) {
    return { ok: false, error: 'Rupture de stock.' };
  }

  if (item.max_per_user) {
    const { count } = await supabase
      .from('user_purchases').select('*', { count: 'exact', head: true })
      .eq('discord_id', discordId).eq('item_id', item.id);
    if ((count ?? 0) >= item.max_per_user) {
      return { ok: false, error: 'Tu as atteint la limite d\'achat pour cet article.' };
    }
  }

  const { data: user } = await supabase
    .from('discord_users').select('balance_pulse, lifetime_spent_pulse').eq('discord_id', discordId).maybeSingle();
  if (!user) return { ok: false, error: 'Envoie un message dans Discord au moins une fois avant d\'acheter.' };
  const cur = (user as { balance_pulse?: number }).balance_pulse ?? 0;
  if (cur < item.price_pulse) return { ok: false, error: 'Pas assez de PULSE.' };

  let balanceAfter = cur - item.price_pulse;
  let lifetimeSpent = ((user as { lifetime_spent_pulse?: number }).lifetime_spent_pulse ?? 0) + item.price_pulse;
  let mysteryReward: number | undefined;

  await supabase.from('pulse_transactions').insert({
    discord_id: discordId,
    type: 'SPEND_SHOP',
    amount: -item.price_pulse,
    reason: `Shop: ${item.name}`,
    ref_id: item.id,
    balance_after: balanceAfter,
  });

  // Mystery box: roll a random amount inside [min, max] and credit it back.
  // Purely self-managed — no admin approval, no bot handler needed.
  const mystery = item.metadata_json?.mystery;
  if (mystery && mystery.min <= mystery.max && mystery.min >= 0) {
    const roll = Math.floor(mystery.min + Math.random() * (mystery.max - mystery.min + 1));
    mysteryReward = roll;
    balanceAfter += roll;
    await supabase.from('pulse_transactions').insert({
      discord_id: discordId,
      type: 'EARN_EVENT',
      amount: roll,
      reason: `Mystery box: ${item.name}`,
      ref_id: item.id,
      balance_after: balanceAfter,
    });
  }

  const lifetimeEarned = mysteryReward
    ? ((user as { lifetime_earned_pulse?: number }).lifetime_earned_pulse ?? 0) + mysteryReward
    : undefined;

  await supabase.from('discord_users').update({
    balance_pulse: balanceAfter,
    lifetime_spent_pulse: lifetimeSpent,
    ...(lifetimeEarned !== undefined ? { lifetime_earned_pulse: lifetimeEarned } : {}),
  }).eq('discord_id', discordId);

  if (item.stock_remaining !== null) {
    await supabase.from('shop_items').update({ stock_remaining: item.stock_remaining - 1 }).eq('id', item.id);
  }

  const orderStatus = item.auto_apply ? 'FULFILLED' : 'PENDING';
  await supabase.from('orders').insert({
    discord_id: discordId,
    item_id: item.id,
    status: orderStatus,
    pulse_spent: item.price_pulse,
  });
  await supabase.from('user_purchases').insert({
    discord_id: discordId,
    item_id: item.id,
  });

  return { ok: true, newBalance: balanceAfter, orderStatus, mysteryReward };
}
