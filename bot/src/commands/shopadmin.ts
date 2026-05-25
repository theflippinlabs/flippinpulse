import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { supabase } from '../supabase.js';
import { pulseEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';

const CATEGORIES = [
  { name: 'Role', value: 'role' },
  { name: 'Perk', value: 'perk' },
  { name: 'Ticket', value: 'ticket' },
  { name: 'Cosmetic', value: 'cosmetic' },
  { name: 'IRL', value: 'irl' },
];

export const data = new SlashCommandBuilder()
  .setName('shopadmin')
  .setDescription('Admin: manage the PULSE shop')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(s =>
    s.setName('add').setDescription('Add a shop item')
      .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true))
      .addIntegerOption(o => o.setName('price').setDescription('Price in PULSE').setMinValue(0).setRequired(true))
      .addStringOption(o => o.setName('category').setDescription('Category').setRequired(true).addChoices(...CATEGORIES))
      .addStringOption(o => o.setName('description').setDescription('Description').setRequired(false))
      .addIntegerOption(o => o.setName('stock').setDescription('Limited stock (leave empty for unlimited)').setMinValue(1).setRequired(false))
      .addIntegerOption(o => o.setName('max_per_user').setDescription('Max purchases per user').setMinValue(1).setRequired(false))
  )
  .addSubcommand(s =>
    s.setName('remove').setDescription('Remove (hide) a shop item')
      .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true))
  )
  .addSubcommand(s =>
    s.setName('setprice').setDescription('Change an item price')
      .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true))
      .addIntegerOption(o => o.setName('price').setDescription('New price in PULSE').setMinValue(0).setRequired(true))
  )
  .addSubcommand(s =>
    s.setName('toggle').setDescription('Activate / deactivate an item')
      .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true))
      .addBooleanOption(o => o.setName('active').setDescription('Active?').setRequired(true))
  )
  .addSubcommand(s => s.setName('list').setDescription('List all items (including hidden)'));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sub = interaction.options.getSubcommand();

  if (sub === 'add') {
    const name = interaction.options.getString('name', true);
    const price = interaction.options.getInteger('price', true);
    const category = interaction.options.getString('category', true);
    const description = interaction.options.getString('description') ?? '';
    const stock = interaction.options.getInteger('stock');
    const maxPerUser = interaction.options.getInteger('max_per_user') ?? 1;

    const { error } = await supabase.from('shop_items').insert({
      name,
      description,
      category,
      price_pulse: price,
      stock_total: stock,
      stock_remaining: stock,
      max_per_user: maxPerUser,
      is_active: true,
    });

    if (error) {
      await interaction.editReply({ embeds: [errorEmbed(`Could not add item: ${error.message}`)] });
      return;
    }
    await interaction.editReply({ embeds: [successEmbed(`Added **${name}** — ${price} PULSE (${category})${stock ? `, stock ${stock}` : ''}.`)] });
    return;
  }

  if (sub === 'list') {
    const { data: items } = await supabase
      .from('shop_items')
      .select('name, price_pulse, category, is_active, stock_remaining')
      .order('price_pulse', { ascending: true })
      .limit(40);

    if (!items?.length) {
      await interaction.editReply({ embeds: [pulseEmbed('Shop items').setDescription('No items yet. Use `/shopadmin add`.')] });
      return;
    }
    const lines = items.map(i => {
      const stock = i.stock_remaining !== null ? ` · ${i.stock_remaining} left` : '';
      return `${i.is_active ? '🟢' : '⚫'} **${i.name}** — ${i.price_pulse} PULSE · ${i.category}${stock}`;
    });
    await interaction.editReply({ embeds: [pulseEmbed('Shop items').setDescription(lines.join('\n'))] });
    return;
  }

  // remove / setprice / toggle all target an item by name
  const name = interaction.options.getString('name', true);
  const { data: item } = await supabase
    .from('shop_items')
    .select('id, name')
    .ilike('name', name)
    .limit(1)
    .single();

  if (!item) {
    await interaction.editReply({ embeds: [errorEmbed(`No item named "${name}" found. Check spelling with \`/shopadmin list\`.`)] });
    return;
  }

  if (sub === 'remove') {
    await supabase.from('shop_items').update({ is_active: false }).eq('id', item.id);
    await interaction.editReply({ embeds: [successEmbed(`**${item.name}** is now hidden from the shop.`)] });
  } else if (sub === 'setprice') {
    const price = interaction.options.getInteger('price', true);
    await supabase.from('shop_items').update({ price_pulse: price }).eq('id', item.id);
    await interaction.editReply({ embeds: [successEmbed(`**${item.name}** price set to **${price}** PULSE.`)] });
  } else if (sub === 'toggle') {
    const active = interaction.options.getBoolean('active', true);
    await supabase.from('shop_items').update({ is_active: active }).eq('id', item.id);
    await interaction.editReply({ embeds: [successEmbed(`**${item.name}** is now ${active ? 'active 🟢' : 'inactive ⚫'}.`)] });
  }
}
