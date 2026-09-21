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
  adoptPet,
  battlePvE,
  feedPet,
  getActivePet,
  playPet,
  retirePet,
  trainPet,
  type Pet,
  type SpeciesKey,
} from '../services/pets.js';

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
  if (!interaction.customId.startsWith('pet:')) return;
  const locale = await getUserLocale(interaction.user.id);
  const fr = locale === 'fr';
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
