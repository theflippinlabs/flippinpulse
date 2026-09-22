import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageActionRowComponentBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { pulseEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';
import {
  SPECIES,
  acceptChallenge,
  adoptPet,
  battlePvE,
  declineChallenge,
  feedPet,
  getActivePet,
  getChallenge,
  openChallenge,
  playPet,
  retirePet,
  trainPet,
  type Pet,
  type SpeciesKey,
} from '../services/pets.js';
import { buySkin, equipSkin, getOwnedSkins, listSkins } from '../services/petSkins.js';

function bar(v: number): string {
  const filled = Math.round((v / 100) * 10);
  return `\`${'▓'.repeat(filled)}${'░'.repeat(10 - filled)}\` ${v}`;
}

function renderPet(p: Pet, fr: boolean): EmbedBuilder {
  const species = SPECIES.find(s => s.key === p.species);
  const label = species?.label[fr ? 'fr' : 'en'] ?? p.species;
  return new EmbedBuilder()
    .setColor(0xF5B62E)
    .setTitle(`${p.emoji} ${p.name} — Lv.${p.level}`)
    .setDescription((fr
      ? `**Espèce :** ${label}\n**XP :** ${p.xp}/100\n\n` +
        `🍖 Faim ${bar(p.hunger)}\n` +
        `😊 Bonheur ${bar(p.happiness)}\n` +
        `⚡ Énergie ${bar(p.energy)}\n` +
        `❤️ Santé ${bar(p.health)}\n\n` +
        `🏆 Victoires ${p.wins} · Défaites ${p.losses}`
      : `**Species:** ${label}\n**XP:** ${p.xp}/100\n\n` +
        `🍖 Hunger ${bar(p.hunger)}\n` +
        `😊 Happiness ${bar(p.happiness)}\n` +
        `⚡ Energy ${bar(p.energy)}\n` +
        `❤️ Health ${bar(p.health)}\n\n` +
        `🏆 Wins ${p.wins} · Losses ${p.losses}`));
}

function actionButtons(fr: boolean) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId('pet:feed').setLabel(fr ? 'Nourrir (5)' : 'Feed (5)').setEmoji('🍖').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('pet:play').setLabel(fr ? 'Jouer' : 'Play').setEmoji('🎾').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('pet:train').setLabel(fr ? 'Entraîner (15)' : 'Train (15)').setEmoji('🥋').setStyle(ButtonStyle.Secondary),
  );
}

export const data = new SlashCommandBuilder()
  .setName('pet')
  .setDescription('Your pet companion / Ton compagnon animal')
  .addSubcommand(s => s.setName('adopt').setDescription('Adopt a pet (100 PULSE) / Adopter un compagnon')
    .addStringOption(o => o.setName('species').setDescription('Species / Espèce').setRequired(true)
      .addChoices(...SPECIES.map(sp => ({ name: `${sp.emoji} ${sp.label.en}`, value: sp.key }))))
    .addStringOption(o => o.setName('name').setDescription('Give it a name / Donne-lui un nom').setRequired(true)))
  .addSubcommand(s => s.setName('view').setDescription('View your pet / Voir ton compagnon'))
  .addSubcommand(s => s.setName('feed').setDescription('Feed your pet / Nourrir ton compagnon'))
  .addSubcommand(s => s.setName('play').setDescription('Play with your pet / Jouer avec ton compagnon'))
  .addSubcommand(s => s.setName('train').setDescription('Train your pet / Entraîner ton compagnon'))
  .addSubcommand(s => s.setName('battle').setDescription('Send your pet into a wild battle / Combat sauvage')
    .addIntegerOption(o => o.setName('wager').setDescription('PULSE wager (0-1000)').setMinValue(0).setMaxValue(1000).setRequired(false)))
  .addSubcommand(s => s.setName('challenge').setDescription("Challenge another member's pet / Défier un autre membre")
    .addUserOption(o => o.setName('opponent').setDescription('Opponent / Adversaire').setRequired(true))
    .addIntegerOption(o => o.setName('wager').setDescription('PULSE wager (0-10000)').setMinValue(0).setMaxValue(10_000).setRequired(false)))
  .addSubcommand(s => s.setName('skins').setDescription('Browse pet skins / Parcourir les skins'))
  .addSubcommand(s => s.setName('buyskin').setDescription('Buy a pet skin / Acheter un skin')
    .addStringOption(o => o.setName('code').setDescription('Skin code (e.g. golden_aura)').setRequired(true)))
  .addSubcommand(s => s.setName('equipskin').setDescription('Equip an owned skin / Équiper un skin')
    .addStringOption(o => o.setName('code').setDescription('Skin code, or "none" to unequip').setRequired(true)))
  .addSubcommand(s => s.setName('retire').setDescription('Retire your pet / Retraite pour ton compagnon'));

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const fr = locale === 'fr';
  const sub = interaction.options.getSubcommand();

  if (sub === 'adopt') {
    const species = interaction.options.getString('species', true) as SpeciesKey;
    const name = interaction.options.getString('name', true);
    const res = await adoptPet(interaction.user.id, species, name);
    if (!res.ok || !res.pet) {
      await interaction.reply({ embeds: [errorEmbed(res.error ?? (fr ? 'Adoption impossible.' : 'Adoption failed.'))], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      embeds: [successEmbed(fr
        ? `${res.pet.emoji} **${res.pet.name}** rejoint ta vie ! Coût 100 PULSE — prends-en soin.`
        : `${res.pet.emoji} **${res.pet.name}** joins your life! Cost 100 PULSE — take good care.`), renderPet(res.pet, fr)],
      components: [actionButtons(fr)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'view') {
    const p = await getActivePet(interaction.user.id);
    if (!p) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Pas de compagnon. Utilise `/pet adopt`.' : 'No pet. Use `/pet adopt`.')], flags: MessageFlags.Ephemeral }); return; }
    await interaction.reply({ embeds: [renderPet(p, fr)], components: [actionButtons(fr)], flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'feed') {
    const res = await feedPet(interaction.user.id, !fr);
    if (!res.ok || !res.pet) { await interaction.reply({ embeds: [errorEmbed(res.error ?? 'Error')], flags: MessageFlags.Ephemeral }); return; }
    const banner = fr
      ? `🍖 **${res.pet.name}** est bien nourri·e (-${res.cost} PULSE).${res.leveledUp ? `\n✨ **Niveau ${res.pet.level} !**` : ''}`
      : `🍖 **${res.pet.name}** is well fed (-${res.cost} PULSE).${res.leveledUp ? `\n✨ **Level up to ${res.pet.level}!**` : ''}`;
    await interaction.reply({ embeds: [successEmbed(banner), renderPet(res.pet, fr)], components: [actionButtons(fr)], flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'play') {
    const res = await playPet(interaction.user.id, !fr);
    if (!res.ok || !res.pet) { await interaction.reply({ embeds: [errorEmbed(res.error ?? 'Error')], flags: MessageFlags.Ephemeral }); return; }
    const banner = fr
      ? `🎾 **${res.pet.name}** s'est bien amusé·e !${res.leveledUp ? `\n✨ **Niveau ${res.pet.level} !**` : ''}`
      : `🎾 **${res.pet.name}** had a blast!${res.leveledUp ? `\n✨ **Level up to ${res.pet.level}!**` : ''}`;
    await interaction.reply({ embeds: [successEmbed(banner), renderPet(res.pet, fr)], components: [actionButtons(fr)], flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'train') {
    const res = await trainPet(interaction.user.id, !fr);
    if (!res.ok || !res.pet) { await interaction.reply({ embeds: [errorEmbed(res.error ?? 'Error')], flags: MessageFlags.Ephemeral }); return; }
    const banner = fr
      ? `🥋 **${res.pet.name}** s'est entraîné·e (-${res.cost} PULSE).${res.leveledUp ? `\n✨ **Niveau ${res.pet.level} !**` : ''}`
      : `🥋 **${res.pet.name}** trained hard (-${res.cost} PULSE).${res.leveledUp ? `\n✨ **Level up to ${res.pet.level}!**` : ''}`;
    await interaction.reply({ embeds: [successEmbed(banner), renderPet(res.pet, fr)], components: [actionButtons(fr)], flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'battle') {
    const wager = interaction.options.getInteger('wager') ?? 0;
    const res = await battlePvE(interaction.user.id, wager, !fr);
    if (!res.ok) { await interaction.reply({ embeds: [errorEmbed(res.error ?? 'Error')], flags: MessageFlags.Ephemeral }); return; }
    const log = res.turns.map(t => `• **${t.attacker}** ${t.move} → **-${t.damage}** on ${t.defender}`).join('\n').slice(0, 3500);
    const won = !!res.winnerId;
    const summary = won
      ? (fr ? `🏆 Victoire ! Gains : **+${res.payout} PULSE**` : `🏆 Victory! Winnings: **+${res.payout} PULSE**`)
      : (fr ? `💥 Défaite. Ton compagnon retourne se reposer.` : `💥 Defeat. Your pet goes to rest.`);
    await interaction.reply({
      embeds: [pulseEmbed(fr ? '⚔️ Combat sauvage' : '⚔️ Wild battle').setDescription(`${log}\n\n${summary}`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'skins') {
    const [skins, owned] = await Promise.all([listSkins(), getOwnedSkins(interaction.user.id)]);
    if (!skins.length) {
      await interaction.reply({ embeds: [errorEmbed(fr ? 'Aucun skin disponible.' : 'No skins available.')], flags: MessageFlags.Ephemeral });
      return;
    }
    const lines = skins.map(s => {
      const own = owned.has(s.id) ? '✅' : '🛒';
      const color = s.aura_hex;
      return `${own} **${s.name}** _(${s.rarity})_ — ${s.price_pulse} PULSE\n\`${s.code}\` · aura ${color}${s.emoji_override ? ` · emoji ${s.emoji_override}` : ''}`;
    }).join('\n\n');
    await interaction.reply({
      embeds: [pulseEmbed(fr ? '🎨 Skins de compagnon' : '🎨 Pet skins').setDescription(
        lines + '\n\n' + (fr ? '_Acheter : `/pet buyskin code:X` · Équiper : `/pet equipskin code:X`_' : '_Buy: `/pet buyskin code:X` · Equip: `/pet equipskin code:X`_'))],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'buyskin') {
    const code = interaction.options.getString('code', true).trim();
    const res = await buySkin(interaction.user.id, code);
    if (!res.ok || !res.skin) {
      const msg = res.error === 'skin_not_found' ? (fr ? 'Skin inconnu.' : 'Unknown skin.')
        : res.error === 'already_owned' ? (fr ? 'Tu possèdes déjà ce skin.' : 'You already own this skin.')
        : (fr ? 'Achat impossible.' : 'Purchase failed.');
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      embeds: [successEmbed(fr
        ? `🎨 Skin **${res.skin.name}** acheté ! Utilise \`/pet equipskin code:${res.skin.code}\` pour l'équiper.`
        : `🎨 Skin **${res.skin.name}** bought! Use \`/pet equipskin code:${res.skin.code}\` to equip it.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'equipskin') {
    const code = interaction.options.getString('code', true).trim().toLowerCase();
    const res = await equipSkin(interaction.user.id, code === 'none' ? null : code);
    if (!res.ok) {
      const msg = res.error === 'no_pet' ? (fr ? 'Pas de compagnon actif.' : 'No active pet.')
        : res.error === 'skin_not_found' ? (fr ? 'Skin inconnu.' : 'Unknown skin.')
        : res.error === 'not_owned' ? (fr ? 'Tu ne possèdes pas ce skin.' : 'You do not own this skin.')
        : (fr ? 'Équipement impossible.' : 'Equip failed.');
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      embeds: [successEmbed(fr
        ? `✨ ${res.skin ? `Skin **${res.skin.name}** équipé !` : 'Skin retiré.'}`
        : `✨ ${res.skin ? `Skin **${res.skin.name}** equipped!` : 'Skin removed.'}`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'challenge') {
    const opponent = interaction.options.getUser('opponent', true);
    const wager = interaction.options.getInteger('wager') ?? 0;
    if (opponent.bot) {
      await interaction.reply({ embeds: [errorEmbed(fr ? "Impossible de défier un bot." : "You can't challenge a bot.")], flags: MessageFlags.Ephemeral });
      return;
    }
    const res = await openChallenge(interaction.user.id, interaction.user.username, opponent.id, wager, !fr);
    if (!res.ok || !res.challengeId || !res.challenger) {
      await interaction.reply({ embeds: [errorEmbed(res.error ?? 'Error')], flags: MessageFlags.Ephemeral });
      return;
    }
    const embed = pulseEmbed(fr ? '⚔️ Défi entre compagnons !' : '⚔️ Pet challenge!').setDescription(
      (fr
        ? `<@${opponent.id}> tu es défié·e par ${res.challenger.emoji} **${res.challenger.name}** (Lv.${res.challenger.level}) de <@${interaction.user.id}> !\n\n💰 Mise : **${wager} PULSE** chacun · Pot total : **${wager * 2} PULSE**\n\n_Le défi expire dans 3 min._`
        : `<@${opponent.id}> you've been challenged by ${res.challenger.emoji} **${res.challenger.name}** (Lv.${res.challenger.level}) from <@${interaction.user.id}>!\n\n💰 Wager: **${wager} PULSE** each · Total pot: **${wager * 2} PULSE**\n\n_Challenge expires in 3 min._`)
    );
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`petpvp:accept:${res.challengeId}`).setLabel(fr ? 'Accepter' : 'Accept').setEmoji('⚔️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`petpvp:decline:${res.challengeId}`).setLabel(fr ? 'Refuser' : 'Decline').setEmoji('🏳️').setStyle(ButtonStyle.Danger),
    );
    await interaction.reply({ embeds: [embed], components: [row], allowedMentions: { users: [opponent.id] } });
    return;
  }

  if (sub === 'retire') {
    const res = await retirePet(interaction.user.id);
    if (!res.ok) { await interaction.reply({ embeds: [errorEmbed(res.error ?? 'Error')], flags: MessageFlags.Ephemeral }); return; }
    await interaction.reply({ embeds: [successEmbed(fr
      ? `Ton compagnon prend sa retraite. Remboursement : **+${res.refund} PULSE**.`
      : `Your pet retires. Refund: **+${res.refund} PULSE**.`)], flags: MessageFlags.Ephemeral });
    return;
  }
}

export async function handlePetInteraction(interaction: import('discord.js').Interaction): Promise<void> {
  if (!interaction.isButton()) return;
  const locale = await getUserLocale(interaction.user.id);
  const fr = locale === 'fr';

  if (interaction.customId.startsWith('petpvp:')) {
    const [, kind, challengeId] = interaction.customId.split(':');
    const c = getChallenge(challengeId);
    if (!c) {
      await interaction.reply({ embeds: [errorEmbed(fr ? 'Défi expiré ou introuvable.' : 'Challenge expired or missing.')], flags: MessageFlags.Ephemeral });
      return;
    }
    if (interaction.user.id !== c.targetId && interaction.user.id !== c.challengerId) {
      await interaction.reply({ embeds: [errorEmbed(fr ? "Tu n'es pas concerné·e par ce défi." : 'This challenge is not for you.')], flags: MessageFlags.Ephemeral });
      return;
    }
    if (kind === 'decline') {
      const r = await declineChallenge(challengeId, interaction.user.id, !fr);
      if (!r.ok) { await interaction.reply({ embeds: [errorEmbed(r.error ?? 'Error')], flags: MessageFlags.Ephemeral }); return; }
      await interaction.update({
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
      await interaction.deferUpdate().catch(() => null);
      const r = await acceptChallenge(challengeId, interaction.user.id, !fr);
      if (!r.ok || !r.turns || !r.challengerPet || !r.targetPet) {
        await interaction.editReply({ embeds: [errorEmbed(r.error ?? 'Error')], components: [] }).catch(() => null);
        return;
      }
      const log = r.turns.map(t => `• **${t.attacker}** ${t.move} → **-${t.damage}** ${t.defender}`).join('\n').slice(0, 3500);
      const winnerId = r.winnerId!;
      const winnerName = winnerId === c.challengerId ? r.challengerPet.name : r.targetPet.name;
      const summary = fr
        ? `🏆 **${winnerName}** l'emporte ! <@${winnerId}> gagne **+${r.pot} PULSE**.`
        : `🏆 **${winnerName}** wins! <@${winnerId}> takes **+${r.pot} PULSE**.`;
      await interaction.editReply({
        embeds: [pulseEmbed(fr ? '⚔️ Combat entre compagnons — Fin' : '⚔️ Pet duel — End').setDescription(`${log}\n\n${summary}`)],
        components: [],
      }).catch(() => null);
      return;
    }
    return;
  }

  if (!interaction.customId.startsWith('pet:')) return;
  const action = interaction.customId.split(':')[1];
  let res;
  if (action === 'feed') res = await feedPet(interaction.user.id, !fr);
  else if (action === 'play') res = await playPet(interaction.user.id, !fr);
  else if (action === 'train') res = await trainPet(interaction.user.id, !fr);
  else return;
  if (!res.ok || !res.pet) {
    await interaction.reply({ embeds: [errorEmbed(res.error ?? 'Error')], flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.update({ embeds: [renderPet(res.pet, fr)], components: [actionButtons(fr)] });
}
