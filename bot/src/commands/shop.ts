import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { supabase } from '../supabase.js';
import { pulseEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('shop')
  .setDescription('Browse the PULSE shop')
  .addStringOption(opt =>
    opt.setName('category')
      .setDescription('Filter by category')
      .setRequired(false)
      .addChoices(
        { name: 'Roles', value: 'role' },
        { name: 'Perks', value: 'perk' },
        { name: 'Tickets', value: 'ticket' },
        { name: 'Cosmetic', value: 'cosmetic' },
        { name: 'IRL', value: 'irl' },
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const category = interaction.options.getString('category');

  let query = supabase
    .from('shop_items')
    .select('name, description, category, price_pulse, stock_remaining')
    .eq('is_active', true)
    .order('price_pulse', { ascending: true });

  if (category) query = query.eq('category', category);

  const { data: items } = await query.limit(15);

  if (!items?.length) {
    await interaction.reply({ content: 'No items available right now!', ephemeral: true });
    return;
  }

  const lines = items.map(item => {
    const stock = item.stock_remaining !== null ? ` (${item.stock_remaining} left)` : '';
    return `**${item.name}** — ${item.price_pulse} PULSE${stock}\n${item.description ?? ''}`;
  });

  const embed = pulseEmbed('PULSE Shop')
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: 'Use /buy <item name> to purchase' });

  await interaction.reply({ embeds: [embed] });
}
