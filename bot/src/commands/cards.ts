import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageActionRowComponentBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { successEmbed, errorEmbed, pulseEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';
import {
  FUSE_COST_MULT,
  PACK_COST,
  RARITY_STYLE,
  SELL_VALUE,
  acceptCardChallenge,
  declineCardChallenge,
  duel,
  effectiveStats,
  fuseCards,
  getCardChallenge,
  getCollection,
  openCardChallenge,
  openPack,
  parseEquipmentInput,
  rarityOrder,
  sellCard,
  type Card,
  type Rarity,
} from '../services/tcg.js';
void FUSE_COST_MULT;

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
    .addStringOption(o => o.setName('opponent').setDescription('Opponent card code / Code de la carte adverse').setRequired(true)))
  .addSubcommand(s => s.setName('challenge').setDescription("Challenge another member's card / Défier un autre membre")
    .addUserOption(o => o.setName('opponent').setDescription('Opponent / Adversaire').setRequired(true))
    .addStringOption(o => o.setName('card').setDescription('Champion character code / Code de ton personnage champion').setRequired(true))
    .addStringOption(o => o.setName('equipment').setDescription('Equipment codes (comma-sep, e.g. e_flame_saber, e_iron_shield:2)').setRequired(false))
    .addIntegerOption(o => o.setName('wager').setDescription('PULSE wager (0-10000)').setMinValue(0).setMaxValue(10_000).setRequired(false)))
  .addSubcommand(s => s.setName('sell').setDescription('Sell duplicate cards / Vendre des doublons')
    .addStringOption(o => o.setName('code').setDescription('Card code / Code de carte').setRequired(true))
    .addIntegerOption(o => o.setName('quantity').setDescription('How many (default 1)').setMinValue(1).setMaxValue(99).setRequired(false)))
  .addSubcommand(s => s.setName('fuse').setDescription('Combine 3 same-rarity cards → 1 higher rarity / Fusionner 3 cartes')
    .addStringOption(o => o.setName('code1').setDescription('First card code / Première carte').setRequired(true))
    .addStringOption(o => o.setName('code2').setDescription('Second card code / Deuxième carte').setRequired(true))
    .addStringOption(o => o.setName('code3').setDescription('Third card code / Troisième carte').setRequired(true)))
  .addSubcommand(s => s.setName('help').setDescription('How the card game works / Comment le jeu fonctionne'));

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

  if (sub === 'sell') {
    const code = interaction.options.getString('code', true).trim();
    const qty = interaction.options.getInteger('quantity') ?? 1;
    const res = await sellCard(interaction.user.id, code, qty);
    if (!res.ok || !res.card) {
      const msg = res.error === 'not_owned' ? (fr ? 'Tu ne possèdes pas cette carte.' : 'You do not own this card.')
        : res.error === 'keep_last_copy' ? (fr ? 'Tu ne peux pas vendre ta dernière copie.' : 'You cannot sell your last copy.')
        : res.error === 'card_not_found' ? (fr ? `Aucune carte pour \`${code}\`.` : `No card for \`${code}\`.`)
        : (fr ? 'Vente impossible.' : 'Sale failed.');
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      embeds: [successEmbed(fr
        ? `💰 Vendu **${res.quantity}× ${res.card.emoji} ${res.card.name}** pour **+${res.pulseEarned} PULSE**.`
        : `💰 Sold **${res.quantity}× ${res.card.emoji} ${res.card.name}** for **+${res.pulseEarned} PULSE**.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'fuse') {
    const c1 = interaction.options.getString('code1', true).trim();
    const c2 = interaction.options.getString('code2', true).trim();
    const c3 = interaction.options.getString('code3', true).trim();
    const res = await fuseCards(interaction.user.id, [c1, c2, c3]);
    if (!res.ok || !res.result || !res.consumed) {
      const msg = res.error === 'card_not_found' ? (fr ? 'Une carte est inconnue.' : 'A card code is unknown.')
        : res.error === 'mixed_rarity' ? (fr ? 'Les 3 cartes doivent être de la même rareté.' : 'The 3 cards must have the same rarity.')
        : res.error === 'not_enough_copies' ? (fr ? 'Tu n\'as pas assez de copies.' : 'You don\'t have enough copies.')
        : res.error === 'max_rarity' ? (fr ? 'Les cartes mythiques ne peuvent pas être fusionnées.' : 'Mythic cards cannot be fused further.')
        : (fr ? 'Fusion impossible.' : 'Fusion failed.');
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      return;
    }
    const rst = RARITY_STYLE[res.result.rarity];
    await interaction.reply({
      embeds: [successEmbed(fr
        ? `${rst.emoji} **FUSION RÉUSSIE !**\n\nConsommé : ${res.consumed.map(c => `${c.emoji} ${c.name}`).join(' + ')}\n\nObtenu : ${res.result.emoji} **${res.result.name}** _(${res.result.rarity})_`
        : `${rst.emoji} **FUSION SUCCESS!**\n\nConsumed: ${res.consumed.map(c => `${c.emoji} ${c.name}`).join(' + ')}\n\nEarned: ${res.result.emoji} **${res.result.name}** _(${res.result.rarity})_`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'challenge') {
    const opponent = interaction.options.getUser('opponent', true);
    const cardCode = interaction.options.getString('card', true).trim();
    const equipmentInput = interaction.options.getString('equipment');
    const equipment = parseEquipmentInput(equipmentInput);
    const wager = interaction.options.getInteger('wager') ?? 0;
    if (opponent.bot) {
      await interaction.reply({ embeds: [errorEmbed(fr ? 'Impossible de défier un bot.' : "You can't challenge a bot.")], flags: MessageFlags.Ephemeral });
      return;
    }
    const res = await openCardChallenge(interaction.user.id, interaction.user.username, opponent.id, cardCode, equipment, wager);
    if (!res.ok || !res.challengeId || !res.challengerCard) {
      const msg = res.error === 'self_challenge' ? (fr ? 'Tu ne peux pas te défier toi-même.' : "You can't challenge yourself.")
        : res.error === 'bad_wager' ? (fr ? 'Mise 0-10000 PULSE.' : 'Wager 0-10000 PULSE.')
        : res.error === 'not_owned' ? (fr ? 'Tu ne possèdes pas cette carte à ce niveau.' : 'You do not own that card at that level.')
        : res.error === 'pending_challenge' ? (fr ? 'Un défi est déjà en attente entre vous.' : 'A challenge is already pending between you two.')
        : res.error === 'card_not_found' ? (fr ? 'Code de carte inconnu.' : 'Unknown card code.')
        : res.error === 'not_a_character' ? (fr ? 'Ta carte champion doit être un personnage.' : 'Your champion must be a character card.')
        : res.error === 'not_an_equipment' ? (fr ? "L'équipement fourni n'est pas une carte équipement." : 'Provided equipment is not an equipment card.')
        : res.error === 'too_many_equipment' ? (fr ? `Maximum 6 équipements.` : `Max 6 equipment items.`)
        : res.error === 'slot_conflict' ? (fr ? 'Un seul équipement par slot (arme, bouclier, sort…).' : 'One equipment per slot (weapon, shield, spell…).')
        : (fr ? 'Défi impossible.' : 'Cannot challenge.');
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      return;
    }
    const cc = res.challengerCard;
    const eqList = res.challengerEquip ?? [];
    const stats = effectiveStats(cc, eqList);
    const rst = RARITY_STYLE[cc.rarity];
    const equipLine = eqList.length
      ? `\n${fr ? '🎽 Équipement' : '🎽 Equipment'} : ${eqList.map(e => `${e.card.emoji} ${e.card.name}${e.level > 1 ? ` \`lv${e.level}\`` : ''}`).join(' · ')}`
      : '';
    const embed = pulseEmbed(fr ? '🎴 Duel de cartes !' : '🎴 Card duel!').setDescription(
      (fr
        ? `<@${opponent.id}> tu es défié·e par <@${interaction.user.id}> !\n\nSon champion : ${rst.emoji} ${cc.emoji} **${cc.name}** _(${cc.rarity})_${equipLine}\n⚔️ ATK ${stats.attack} · 🛡️ DEF ${stats.defense} · 💨 SPD ${stats.speed}\n\n💰 Mise : **${wager} PULSE** chacun · Pot : **${wager * 2} PULSE**\n\n_Clique **Accepter** pour choisir ton champion et jusqu'à 6 équipements (1 par slot). Expire dans 3 min._`
        : `<@${opponent.id}> you've been challenged by <@${interaction.user.id}>!\n\nTheir champion: ${rst.emoji} ${cc.emoji} **${cc.name}** _(${cc.rarity})_${equipLine}\n⚔️ ATK ${stats.attack} · 🛡️ DEF ${stats.defense} · 💨 SPD ${stats.speed}\n\n💰 Wager: **${wager} PULSE** each · Pot: **${wager * 2} PULSE**\n\n_Tap **Accept** to pick your champion and up to 6 equipment (1 per slot). Expires in 3 min._`)
    );
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`tcgpvp:accept:${res.challengeId}`).setLabel(fr ? 'Accepter' : 'Accept').setEmoji('⚔️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`tcgpvp:decline:${res.challengeId}`).setLabel(fr ? 'Refuser' : 'Decline').setEmoji('🏳️').setStyle(ButtonStyle.Danger),
    );
    await interaction.reply({ embeds: [embed], components: [row], allowedMentions: { users: [opponent.id] } });
    return;
  }

  if (sub === 'help') {
    const desc = fr
      ? `**But du jeu 🎯**\n` +
        `Collectionne les 32 cartes du jeu, combats les autres membres, et gagne du PULSE.\n\n` +
        `**🎁 Ouvrir un booster** — \`${'/cards open'}\` — **${PACK_COST} PULSE**\n` +
        `Tu tires 5 cartes aléatoires. Chance de tirer :\n` +
        `⚪ Commune ${68}% · 🔵 Rare ${23}% · 🟣 Épique ${7}% · 🟠 Légendaire ${1.8}% · 🔴 Mythique ${0.2}%\n` +
        `_Anti-loose : si tes 4 premières cartes sont communes, la 5ᵉ est forcée à Rare ou plus._\n\n` +
        `**⚔️ Défier un membre** — \`${'/cards challenge'}\`\n` +
        `Tu choisis ta meilleure carte et un adversaire. Il choisit sa carte champion. Vos 2 cartes s'affrontent sur ATK / DEF / SPD → gagnant sur 2 rounds prend le pot.\n\n` +
        `**💰 Vendre les doublons** — \`${'/cards sell'}\`\n` +
        `Récupère du PULSE sur tes cartes en double (dernière copie protégée).\n` +
        `⚪ ${SELL_VALUE.common} · 🔵 ${SELL_VALUE.rare} · 🟣 ${SELL_VALUE.epic} · 🟠 ${SELL_VALUE.legendary} · 🔴 ${SELL_VALUE.mythic} PULSE\n\n` +
        `**🔀 Fusionner** — \`${'/cards fuse code1 code2 code3'}\`\n` +
        `3 cartes de la MÊME rareté → 1 carte aléatoire de la rareté supérieure. Ex. 3 communes → 1 rare. Idéal pour monter en gamme sans loot chance.\n\n` +
        `**⚙️ Autres commandes**\n` +
        `\`/cards collection\` — voir ta collection · \`/cards info code:X\` — fiche d'une carte · \`/cards duel\` — duel entre 2 cartes (test)\n\n` +
        `**💡 Astuces**\n` +
        `• Vends les commun/rare en trop pour financer de nouveaux boosters.\n` +
        `• Garde tes légendaires pour les défis à grosse mise.\n` +
        `• Le PULSE gagné en défi = pot × 2, donc défie quand tu es sûr de ta carte.\n` +
        `• L'app web \`/app/cards\` a un ouvre-booster animé et une belle vue de collection.`
      : `**Goal 🎯**\n` +
        `Collect all 32 cards, battle other members, and earn PULSE.\n\n` +
        `**🎁 Open a pack** — \`${'/cards open'}\` — **${PACK_COST} PULSE**\n` +
        `You draw 5 random cards. Pull rates:\n` +
        `⚪ Common ${68}% · 🔵 Rare ${23}% · 🟣 Epic ${7}% · 🟠 Legendary ${1.8}% · 🔴 Mythic ${0.2}%\n` +
        `_Pity: if your first 4 pulls are all commons, the 5th is forced to Rare or better._\n\n` +
        `**⚔️ Challenge a member** — \`${'/cards challenge'}\`\n` +
        `Pick your best card and an opponent. They pick their champion. Both cards clash on ATK / DEF / SPD → best-of-3 winner takes the pot.\n\n` +
        `**💰 Sell duplicates** — \`${'/cards sell'}\`\n` +
        `Get PULSE back for spare copies (last copy is protected).\n` +
        `⚪ ${SELL_VALUE.common} · 🔵 ${SELL_VALUE.rare} · 🟣 ${SELL_VALUE.epic} · 🟠 ${SELL_VALUE.legendary} · 🔴 ${SELL_VALUE.mythic} PULSE\n\n` +
        `**🔀 Fuse** — \`${'/cards fuse code1 code2 code3'}\`\n` +
        `3 cards of the SAME rarity → 1 random card of the next rarity. E.g. 3 commons → 1 rare. Perfect for climbing without pack RNG.\n\n` +
        `**⚙️ Other commands**\n` +
        `\`/cards collection\` — your collection · \`/cards info code:X\` — card sheet · \`/cards duel\` — test-duel between 2 cards\n\n` +
        `**💡 Tips**\n` +
        `• Sell extra commons/rares to fund new packs.\n` +
        `• Save your legendaries for high-wager challenges.\n` +
        `• PvP payout = pot × 2, so challenge only when confident.\n` +
        `• The web app \`/app/cards\` has an animated pack opener and a nice collection browser.`;
    await interaction.reply({
      embeds: [pulseEmbed(fr ? '🎴 Cartes Novarys — Règles du jeu' : '🎴 Novarys Cards — Rules').setDescription(desc)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
}

// ---- Card PvP button + modal router ----
export async function handleCardChallengeInteraction(interaction: import('discord.js').Interaction): Promise<void> {
  const locale = await getUserLocale(interaction.user.id);
  const fr = locale === 'fr';

  if (interaction.isButton() && interaction.customId.startsWith('tcgpvp:')) {
    const parts = interaction.customId.split(':');
    const kind = parts[1];
    const challengeId = parts[2];
    const c = getCardChallenge(challengeId);
    if (!c) {
      await interaction.reply({ embeds: [errorEmbed(fr ? 'Défi expiré ou introuvable.' : 'Challenge expired or missing.')], flags: MessageFlags.Ephemeral });
      return;
    }
    if (interaction.user.id !== c.targetId && interaction.user.id !== c.challengerId) {
      await interaction.reply({ embeds: [errorEmbed(fr ? "Tu n'es pas concerné·e." : 'This challenge is not for you.')], flags: MessageFlags.Ephemeral });
      return;
    }
    if (kind === 'decline') {
      const r = await declineCardChallenge(challengeId, interaction.user.id);
      if (!r.ok) { await interaction.reply({ embeds: [errorEmbed(r.error ?? 'Error')], flags: MessageFlags.Ephemeral }); return; }
      await (interaction as ButtonInteraction).update({
        embeds: [errorEmbed(fr ? `Défi refusé par <@${interaction.user.id}>. Mise remboursée.` : `Challenge declined by <@${interaction.user.id}>. Wager refunded.`)],
        components: [],
      });
      return;
    }
    if (kind === 'accept') {
      if (interaction.user.id !== c.targetId) {
        await interaction.reply({ embeds: [errorEmbed(fr ? 'Seule la cible peut accepter.' : 'Only the target can accept.')], flags: MessageFlags.Ephemeral });
        return;
      }
      const modal = new ModalBuilder()
        .setCustomId(`tcgpvp:pickmodal:${challengeId}`)
        .setTitle(fr ? 'Choisis ton champion' : 'Pick your champion')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('code')
              .setLabel(fr ? 'Personnage (ex. l_solar_phoenix)' : 'Character (e.g. l_solar_phoenix)')
              .setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('equip')
              .setLabel(fr ? 'Équipement (max 6, 1/slot, `code:niveau`)' : 'Equipment (max 6, 1/slot, `code:level`)')
              .setStyle(TextInputStyle.Short).setRequired(false)
              .setPlaceholder(fr ? 'ex. e_flame_saber, e_iron_shield:2' : 'e.g. e_flame_saber, e_iron_shield:2')));
      await (interaction as ButtonInteraction).showModal(modal);
      return;
    }
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('tcgpvp:pickmodal:')) {
    const challengeId = interaction.customId.split(':')[2];
    const modal = interaction as ModalSubmitInteraction;
    const code = modal.fields.getTextInputValue('code').trim();
    const equipRaw = modal.fields.getTextInputValue('equip');
    const equipEntries = parseEquipmentInput(equipRaw);
    await modal.deferUpdate().catch(() => null);
    const res = await acceptCardChallenge(challengeId, interaction.user.id, code, equipEntries);
    if (!res.ok || !res.challengerCard || !res.targetCard || !res.turns) {
      const msg = res.error === 'not_owned' ? (fr ? 'Tu ne possèdes pas cette carte à ce niveau.' : 'You do not own that card at that level.')
        : res.error === 'card_not_found' ? (fr ? 'Code de carte inconnu.' : 'Unknown card code.')
        : res.error === 'not_found' ? (fr ? 'Défi introuvable.' : 'Challenge not found.')
        : res.error === 'not_a_character' ? (fr ? 'Ton champion doit être un personnage.' : 'Your champion must be a character card.')
        : res.error === 'not_an_equipment' ? (fr ? "Un des codes n'est pas un équipement." : 'One of the codes is not equipment.')
        : res.error === 'too_many_equipment' ? (fr ? 'Maximum 6 équipements.' : 'Max 6 equipment items.')
        : res.error === 'slot_conflict' ? (fr ? 'Un seul équipement par slot.' : 'One equipment per slot.')
        : (fr ? 'Erreur.' : 'Error.');
      await modal.followUp({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      return;
    }
    const cc = res.challengerCard; const tc = res.targetCard;
    const cEq = res.challengerEquip ?? []; const tEq = res.targetEquip ?? [];
    const lines = res.turns.map(t => {
      const won = t.challengerRoll >= t.targetRoll;
      const badge = won ? '🏆' : '💥';
      return `${badge} **${t.stat.toUpperCase()}** — ${cc.emoji} ${t.challengerRoll} vs ${t.targetRoll} ${tc.emoji}`;
    }).join('\n');
    const winner = res.winnerId === interaction.user.id ? tc : cc;
    const cEqLine = cEq.length ? `\n_${cEq.map(e => `${e.card.emoji} ${e.card.name}${e.level > 1 ? ` lv${e.level}` : ''}`).join(' · ')}_` : '';
    const tEqLine = tEq.length ? `\n_${tEq.map(e => `${e.card.emoji} ${e.card.name}${e.level > 1 ? ` lv${e.level}` : ''}`).join(' · ')}_` : '';
    const summary = fr
      ? `\n\n🏆 **${winner.name}** l'emporte ${Math.max(res.challengerScore!, res.targetScore!)}–${Math.min(res.challengerScore!, res.targetScore!)} · <@${res.winnerId}> gagne **+${res.pot} PULSE**.`
      : `\n\n🏆 **${winner.name}** wins ${Math.max(res.challengerScore!, res.targetScore!)}–${Math.min(res.challengerScore!, res.targetScore!)} · <@${res.winnerId}> takes **+${res.pot} PULSE**.`;
    await modal.editReply({
      embeds: [pulseEmbed(fr ? '🎴 Duel terminé' : '🎴 Duel end').setDescription(
        `${cc.emoji} **${cc.name}**${cEqLine}\n\n**vs**\n\n${tc.emoji} **${tc.name}**${tEqLine}\n\n${lines}${summary}`
      )],
      components: [],
    }).catch(() => null);
  }
}
