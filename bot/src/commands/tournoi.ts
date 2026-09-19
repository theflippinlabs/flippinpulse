import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageActionRowComponentBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
} from 'discord.js';
import { supabase } from '../supabase.js';
import { requireLord, memberIsLord } from '../services/lord.js';
import {
  cancelTournament,
  createTournament,
  getOpenTournamentInGuild,
  getTournament,
  joinTournament,
  listPlayers,
  refreshLobbyMessage,
  startTournament,
} from '../services/tournaments.js';
import { errorEmbed, successEmbed, pulseEmbed } from '../utils/embeds.js';
import { log } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('tournoi')
  .setDescription('PvP tournament — bracket, buy-in, one champion takes the pot')
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
  .addSubcommand(s =>
    s.setName('create')
      .setDescription('Lord: open a new tournament in this channel')
      .addIntegerOption(o => o.setName('buyin').setDescription('PULSE cost to enter (0 = free)').setMinValue(0).setRequired(true))
      .addIntegerOption(o => o.setName('players').setDescription('Max players (2-64)').setMinValue(2).setMaxValue(64).setRequired(false))
      .addStringOption(o => o.setName('title').setDescription('Tournament title').setRequired(false)),
  )
  .addSubcommand(s => s.setName('status').setDescription('Show the current tournament'));

async function postLobby(interaction: ChatInputCommandInteraction, tournamentId: string): Promise<void> {
  const t = await getTournament(tournamentId);
  if (!t || !t.channel_id) return;
  const channel = await interaction.client.channels.fetch(t.channel_id).catch(() => null) as TextChannel | null;
  if (!channel) return;
  const players = await listPlayers(t.id);
  const embed = new EmbedBuilder()
    .setColor(0x9F7AEA)
    .setTitle(`🏟️ ${t.title}`)
    .setDescription(
      `**Buy-in:** ${t.buy_in} PULSE · **Pot:** ${t.pot_pulse} PULSE\n` +
      `**Players:** ${players.length} / ${t.max_players}\n\n` +
      (players.length ? players.map(p => `• ${p.username}`).join('\n') : '_No one yet — press Join!_'),
    )
    .setFooter({ text: 'Press Join to enter the arena.' })
    .setTimestamp();
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`tour:join:${t.id}`).setLabel(`Join (${t.buy_in} PULSE)`).setEmoji('⚔️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`tour:start:${t.id}`).setLabel('Start (Lord)').setEmoji('▶️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`tour:cancel:${t.id}`).setLabel('Cancel (Lord)').setEmoji('✖️').setStyle(ButtonStyle.Danger),
  );
  const msg = await channel.send({ embeds: [embed], components: [row] });
  await supabase.from('tournaments').update({ message_id: msg.id }).eq('id', t.id);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ embeds: [errorEmbed('Server only.')], flags: MessageFlags.Ephemeral });
    return;
  }
  const sub = interaction.options.getSubcommand();

  if (sub === 'create') {
    if (!(await requireLord(interaction))) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const existing = await getOpenTournamentInGuild(interaction.guild.id);
    if (existing) {
      await interaction.editReply({
        embeds: [errorEmbed(`A tournament is already ${existing.status}. Finish or cancel it first.`)],
      });
      return;
    }

    const buyIn = interaction.options.getInteger('buyin', true);
    const maxPlayers = interaction.options.getInteger('players') ?? 16;
    const title = interaction.options.getString('title') ?? '⚔️ Novarys Arena';

    const channel = interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.editReply({ embeds: [errorEmbed('Use this command in a normal text channel.')] });
      return;
    }

    const t = await createTournament({
      guildId: interaction.guild.id,
      title,
      buyIn,
      maxPlayers,
      channelId: channel.id,
      createdBy: interaction.user.id,
    });
    if (!t) {
      await interaction.editReply({ embeds: [errorEmbed('Could not create the tournament.')] });
      return;
    }

    await postLobby(interaction, t.id);
    await interaction.editReply({
      embeds: [successEmbed(`Tournament **${title}** opened in <#${channel.id}>. Members can press **Join**; you press **Start** when ready.`)],
    });
    return;
  }

  if (sub === 'status') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const t = await getOpenTournamentInGuild(interaction.guild.id);
    if (!t) {
      await interaction.editReply({ embeds: [errorEmbed('No tournament open right now. A Lord can open one with `/tournoi create`.')] });
      return;
    }
    const players = await listPlayers(t.id);
    await interaction.editReply({
      embeds: [pulseEmbed(`🏟️ ${t.title}`).setDescription(
        `**Status:** ${t.status}\n**Buy-in:** ${t.buy_in} PULSE · **Pot:** ${t.pot_pulse} PULSE\n**Players:** ${players.length} / ${t.max_players}\n\n` +
        (players.length ? players.map(p => `• ${p.username}`).join('\n') : '_No one yet_'),
      )],
    });
    return;
  }
}

// ---------- Button interactions (join / start / cancel) ----------
export async function handleTournamentButton(interaction: ButtonInteraction): Promise<void> {
  const [, action, tournamentId] = interaction.customId.split(':');
  const t = await getTournament(tournamentId);
  if (!t) {
    await interaction.reply({ embeds: [errorEmbed('Tournament not found.')], flags: MessageFlags.Ephemeral });
    return;
  }

  if (action === 'join') {
    const res = await joinTournament(t, interaction.user.id, interaction.user.username);
    if (!res.ok) {
      await interaction.reply({ embeds: [errorEmbed(res.error ?? 'Could not join.')], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ embeds: [successEmbed(`You're in **${t.title}**. Good luck. ⚔️`)], flags: MessageFlags.Ephemeral });
    const fresh = await getTournament(t.id);
    if (fresh) await refreshLobbyMessage(interaction.client, fresh);
    return;
  }

  const member = interaction.member && 'guild' in interaction.member ? interaction.member : null;
  if (!memberIsLord(member as never)) {
    await interaction.reply({ embeds: [errorEmbed('Only a Lord can start or cancel a tournament.')], flags: MessageFlags.Ephemeral });
    return;
  }

  if (action === 'start') {
    await interaction.reply({ embeds: [successEmbed('Starting the bracket…')], flags: MessageFlags.Ephemeral });
    const res = await startTournament(interaction.client, t);
    if (!res.ok) {
      await interaction.followUp({ embeds: [errorEmbed(res.error ?? 'Could not start.')], flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    return;
  }

  if (action === 'cancel') {
    const refunded = await cancelTournament(t);
    const fresh = await getTournament(t.id);
    if (fresh) await refreshLobbyMessage(interaction.client, fresh);
    await interaction.reply({
      embeds: [successEmbed(`Tournament cancelled. Refunded **${refunded}** player${refunded === 1 ? '' : 's'}.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  log('WARN', `Unknown tournament button action: ${action}`);
}
