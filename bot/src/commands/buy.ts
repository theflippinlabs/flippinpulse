import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { supabase } from '../supabase.js';
import { spendPulse } from '../services/economy.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale, t } from '../i18n.js';

export const data = new SlashCommandBuilder()
  .setName('buy')
  .setDescription('Purchase an item from the shop')
  .addStringOption(opt =>
    opt.setName('item').setDescription('Item name').setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const itemName = interaction.options.getString('item', true);
  await interaction.deferReply({ ephemeral: true });

  const { data: items } = await supabase
    .from('shop_items')
    .select('*')
    .eq('is_active', true)
    .ilike('name', itemName);

  const item = items?.[0];
  if (!item) {
    await interaction.editReply({ embeds: [errorEmbed(t('buy', 'not_found', locale, { name: itemName }))] });
    return;
  }

  if (item.stock_remaining !== null && item.stock_remaining <= 0) {
    await interaction.editReply({ embeds: [errorEmbed(t('buy', 'out_of_stock', locale))] });
    return;
  }

  if (item.max_per_user) {
    const { data: purchases } = await supabase
      .from('user_purchases')
      .select('id')
      .eq('discord_id', interaction.user.id)
      .eq('item_id', item.id);

    if ((purchases?.length ?? 0) >= item.max_per_user) {
      await interaction.editReply({ embeds: [errorEmbed(t('buy', 'max_reached', locale))] });
      return;
    }
  }

  const result = await spendPulse(interaction.user.id, item.price_pulse, `Shop: ${item.name}`, item.id);
  if (!result.success) {
    await interaction.editReply({ embeds: [errorEmbed(result.error ?? t('buy', 'failed', locale))] });
    return;
  }

  if (item.stock_remaining !== null) {
    await supabase
      .from('shop_items')
      .update({ stock_remaining: item.stock_remaining - 1 })
      .eq('id', item.id);
  }

  const orderStatus = item.auto_apply ? 'FULFILLED' : 'PENDING';
  await supabase.from('orders').insert({
    discord_id: interaction.user.id,
    item_id: item.id,
    status: orderStatus,
    pulse_spent: item.price_pulse,
  });
  await supabase.from('user_purchases').insert({
    discord_id: interaction.user.id,
    item_id: item.id,
  });

  const applied = item.auto_apply ? t('buy', 'auto_applied', locale) : t('buy', 'pending', locale);
  await interaction.editReply({
    embeds: [successEmbed(t('buy', 'success', locale, {
      name: item.name, price: item.price_pulse, applied, balance: result.newBalance ?? 0,
    }))],
  });
}
