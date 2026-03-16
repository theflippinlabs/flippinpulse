import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { supabase } from '../supabase.js';
import { spendPulse } from '../services/economy.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('buy')
  .setDescription('Purchase an item from the shop')
  .addStringOption(opt =>
    opt.setName('item').setDescription('Item name').setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const itemName = interaction.options.getString('item', true);
  await interaction.deferReply({ ephemeral: true });

  // Find item (case-insensitive)
  const { data: items } = await supabase
    .from('shop_items')
    .select('*')
    .eq('is_active', true)
    .ilike('name', itemName);

  const item = items?.[0];
  if (!item) {
    await interaction.editReply({ embeds: [errorEmbed(`Item "${itemName}" not found. Use /shop to browse.`)] });
    return;
  }

  // Check stock
  if (item.stock_remaining !== null && item.stock_remaining <= 0) {
    await interaction.editReply({ embeds: [errorEmbed('This item is out of stock!')] });
    return;
  }

  // Check max per user
  if (item.max_per_user) {
    const { data: purchases } = await supabase
      .from('user_purchases')
      .select('id')
      .eq('discord_id', interaction.user.id)
      .eq('item_id', item.id);

    if ((purchases?.length ?? 0) >= item.max_per_user) {
      await interaction.editReply({ embeds: [errorEmbed(`You've reached the purchase limit for this item.`)] });
      return;
    }
  }

  // Spend PULSE
  const result = await spendPulse(interaction.user.id, item.price_pulse, `Shop: ${item.name}`, item.id);
  if (!result.success) {
    await interaction.editReply({ embeds: [errorEmbed(result.error ?? 'Purchase failed.')] });
    return;
  }

  // Decrement stock
  if (item.stock_remaining !== null) {
    await supabase
      .from('shop_items')
      .update({ stock_remaining: item.stock_remaining - 1 })
      .eq('id', item.id);
  }

  // Create order
  const orderStatus = item.auto_apply ? 'FULFILLED' : 'PENDING';
  await supabase.from('orders').insert({
    discord_id: interaction.user.id,
    item_id: item.id,
    status: orderStatus,
    pulse_spent: item.price_pulse,
  });

  // Record purchase
  await supabase.from('user_purchases').insert({
    discord_id: interaction.user.id,
    item_id: item.id,
  });

  const statusMsg = item.auto_apply
    ? 'Your item has been applied automatically!'
    : 'Your order is pending admin approval.';

  await interaction.editReply({
    embeds: [successEmbed(`Purchased **${item.name}** for ${item.price_pulse} PULSE!\n${statusMsg}\nNew balance: **${result.newBalance}** PULSE`)]
  });
}
