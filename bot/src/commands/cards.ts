import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { successEmbed, errorEmbed, pulseEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';
import {
  RARITY_STYLE,
  duel,
  getCollection,
  openPack,
  PACK_COST,
  rarityOrder,
  type Card,
  type Rarity,
} from '../services/tcg.js';

function renderPack(pulls: { card: Card; isNew: boolean }[], fr: boolean): EmbedBuilder {
  const best = pulls.reduce<Rarity>((acc, p) => rarityOrder(p.card.rarity) > rarityOrder(acc) ? p.card.rarity : acc, 'common');
  const style = RARITY_STYLE[best];
  const lines = pulls.map(p => {
    const st = RARITY_STYLE[p.card.rarity];
    const tag = p.isNew ? (fr ? ' — 🆕 **NOUVELLE**' : ' — 🆕 **NEW**') : '';
    return `${st.emoji} ${p.card.emoji} **${p.card.name}** _(${p.card.rarity})_${tag}`;
  });
  return new EmbedBuilder()
    .setColor(style.color)
    .setTitle(fr ? '🎴 Ouverture d\'un booster' : '🎴 Pack opened')
    .setDescription(lines.join('\n'))
    .setFooter({ text: fr ? `Meilleur tirage : ${best}` : `Best pull: ${best}` });
}

export const data = new SlashCommandBuilder()
  .setName('cards')
  .setDescription('Trading card collection / Collection de cartes à collectionner')
  .addSubcommand(s => s.setName('open').setDescription(`Open a card pack (${PACK_COST} PULSE) / Ouvrir un booster`))
  .addSubcommand(s => s.setName('collection').setDescription('View your collection / Voir ta collection'))
  .addSubcommand(s => s.setName('info').setDescription('View a specific card / Voir une carte')
    .addStringOption(o => o.setName('code').setDescription('Card code (e.g. c_flame_pup) / Code de carte').setRequired(true)))
  .addSubcommand(s => s.setName('duel').setDescription('Duel a card of yours against another / Duel entre deux cartes')
    .addStringOption(o => o.setName('mine').setDescription('Your card code / Code de ta carte').setRequired(true))
    .addStringOption(o => o.setName('opponent').setDescription('Opponent card code / Code de la carte adverse').setRequired(true)));

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const fr = locale === 'fr';
  const sub = interaction.options.getSubcommand();

  if (sub === 'open') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const res = await openPack(interaction.user.id);
    if (!res.ok) { await interaction.editReply({ embeds: [errorEmbed(res.error ?? 'Error')] }); return; }
    await interaction.editReply({ embeds: [renderPack(res.pulled, fr)] });
    return;
  }

  if (sub === 'collection') {
    const col = await getCollection(interaction.user.id);
    if (!col.totalCards) {
      await interaction.reply({ embeds: [errorEmbed(fr
        ? `Collection vide. Ouvre un booster avec \`/cards open\` (${PACK_COST} PULSE).`
        : `Empty collection. Open a pack with \`/cards open\` (${PACK_COST} PULSE).`)], flags: MessageFlags.Ephemeral });
      return;
    }
    const bar = (owned: number, total: number) => {
      const pct = total ? owned / total : 0;
      const width = 8;
      const filled = Math.round(pct * width);
      return `\`${'▓'.repeat(filled)}${'░'.repeat(width - filled)}\` ${owned}/${total}`;
    };
    const rarityLines = (['mythic', 'legendary', 'epic', 'rare', 'common'] as Rarity[])
      .map(r => `${RARITY_STYLE[r].emoji} **${r}** — ${bar(col.byRarity[r].owned, col.byRarity[r].total)}`)
      .join('\n');
    const list = col.rows.slice(0, 30).map(r => {
      const st = RARITY_STYLE[r.card.rarity];
      return `${st.emoji} ${r.card.emoji} **${r.card.name}** ×${r.quantity} _(${r.card.rarity})_ \`${r.card.code}\``;
    }).join('\n');
    const more = col.rows.length > 30 ? (fr ? `\n\n_… et ${col.rows.length - 30} autres._` : `\n\n_… and ${col.rows.length - 30} more._`) : '';
    await interaction.reply({
      embeds: [pulseEmbed(fr ? '🎴 Collection' : '🎴 Collection').setDescription(
        (fr
          ? `**${col.totalUnique} / ${col.totalCatalog}** cartes uniques · **${col.totalCards}** au total\n\n${rarityLines}\n\n${list}${more}`
          : `**${col.totalUnique} / ${col.totalCatalog}** unique cards · **${col.totalCards}** total\n\n${rarityLines}\n\n${list}${more}`))],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'info') {
    const code = interaction.options.getString('code', true).trim();
    const { supabase } = await import('../supabase.js');
    const { data } = await supabase.from('tcg_cards').select('*').eq('code', code).maybeSingle();
    if (!data) { await interaction.reply({ embeds: [errorEmbed(fr ? `Aucune carte pour \`${code}\`.` : `No card for \`${code}\`.`)], flags: MessageFlags.Ephemeral }); return; }
    const card = data as Card;
    const st = RARITY_STYLE[card.rarity];
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(st.color)
        .setTitle(`${card.emoji} ${card.name} — ${st.emoji} ${card.rarity}`)
        .setDescription(`_${card.flavor}_\n\n⚔️ **ATK** ${card.attack} · 🛡️ **DEF** ${card.defense} · 💨 **SPD** ${card.speed}`)
        .setFooter({ text: `code: ${card.code}` })],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'duel') {
    const mineCode = interaction.options.getString('mine', true).trim();
    const oppCode = interaction.options.getString('opponent', true).trim();
    const { supabase } = await import('../supabase.js');
    const { data: cards } = await supabase.from('tcg_cards').select('id, code').in('code', [mineCode, oppCode]);
    const map = new Map((cards ?? []).map(c => [c.code, c.id]));
    const myId = map.get(mineCode); const oppId = map.get(oppCode);
    if (!myId || !oppId) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Code de carte inconnu.' : 'Unknown card code.')], flags: MessageFlags.Ephemeral }); return; }
    const res = await duel(interaction.user.id, myId, oppId);
    if (!res.ok || !res.myCard || !res.oppCard) { await interaction.reply({ embeds: [errorEmbed(res.error ?? 'Error')], flags: MessageFlags.Ephemeral }); return; }
    const banner = res.won
      ? (fr ? `🏆 Victoire ! **${res.myCard.name}** l'emporte ${res.myScore}-${res.oppScore}` : `🏆 Victory! **${res.myCard.name}** wins ${res.myScore}-${res.oppScore}`)
      : (fr ? `💥 Défaite. **${res.oppCard.name}** l'emporte ${res.oppScore}-${res.myScore}` : `💥 Defeat. **${res.oppCard.name}** wins ${res.oppScore}-${res.myScore}`);
    await interaction.reply({ embeds: [(res.won ? successEmbed : errorEmbed)(banner)], flags: MessageFlags.Ephemeral });
    return;
  }
}
