import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import {
  applyJail,
  clearJail,
  ensureJailRole,
  fetchActiveJail,
  getJailConfig,
  parseJailDuration,
  recordJail,
  releaseJail,
  setJailChannel,
} from '../services/jail.js';
import { logAndAnnounce } from '../services/moderation.js';
import { requireLord } from '../services/lord.js';
import { successEmbed, errorEmbed, pulseEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('jail')
  .setDescription('Lord-only: send a member to the jail channel')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(s =>
    s.setName('setup')
      .setDescription('Pick the jail channel (and optionally the role to reuse)')
      .addChannelOption(o =>
        o.setName('channel')
          .setDescription('The jail channel')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true))
      .addRoleOption(o =>
        o.setName('role')
          .setDescription('Reuse an existing role (e.g. Jail Inmate) instead of creating "Jailed"')
          .setRequired(false)),
  )
  .addSubcommand(s =>
    s.setName('add')
      .setDescription('Send a member to jail')
      .addUserOption(o => o.setName('user').setDescription('Who to jail').setRequired(true))
      .addStringOption(o => o.setName('duration').setDescription('e.g. 10m · 2h · 1d · 1w · 1mo · 1y · life').setRequired(false))
      .addStringOption(o => o.setName('reason').setDescription('Why').setRequired(false)),
  )
  .addSubcommand(s =>
    s.setName('remove')
      .setDescription('Release a member from jail')
      .addUserOption(o => o.setName('user').setDescription('Who to release').setRequired(true)),
  )
  .addSubcommand(s =>
    s.setName('status')
      .setDescription('Show the jail configuration and current inmates'),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ embeds: [errorEmbed('Server only.')], flags: MessageFlags.Ephemeral });
    return;
  }

  if (!(await requireLord(interaction))) return;

  const sub = interaction.options.getSubcommand();

  if (sub === 'setup') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = interaction.options.getChannel('channel', true);
    const preferRole = interaction.options.getRole('role');
    await setJailChannel(channel.id);
    const role = await ensureJailRole(interaction.guild, channel.id, preferRole?.id);
    if (!role) {
      await interaction.editReply({
        embeds: [errorEmbed('Set the channel, but I could not prepare the jail role. Give me the "Manage Roles" permission and try again.')],
      });
      return;
    }
    await interaction.editReply({
      embeds: [successEmbed(
        `Jail configured. <#${channel.id}> is the jail, and members who go there will be locked to that channel via the <@&${role.id}> role.\n\n⚠️ Make sure the **${role.name}** role is *above* other member roles you want it to override — I already stripped view access from every channel I could manage.`,
      )],
    });
    return;
  }

  if (sub === 'add') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const cfg = getJailConfig();
    if (!cfg.channel_id) {
      await interaction.editReply({ embeds: [errorEmbed('Pick the jail channel first with `/jail setup`.')] });
      return;
    }

    const target = interaction.options.getUser('user', true);
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    const parsed = parseJailDuration(durationStr);
    if (!parsed) {
      await interaction.editReply({
        embeds: [errorEmbed('Invalid duration. Try `30s`, `10m`, `2h`, `1d`, `1w`, `1mo`, `1y`, or `life`.')],
      });
      return;
    }
    const seconds = parsed.seconds;
    const durLabel = parsed.forLife
      ? 'for **LIFE 🔒**'
      : (seconds && durationStr ? `for **${durationStr}**` : '**indefinitely**');

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      await interaction.editReply({ embeds: [errorEmbed('Member not found in this server.')] });
      return;
    }
    if (member.id === interaction.guild.ownerId) {
      await interaction.editReply({ embeds: [errorEmbed('I cannot jail the server owner.')] });
      return;
    }
    if (member.id === interaction.client.user?.id) {
      await interaction.editReply({ embeds: [errorEmbed('Nice try. 😄')] });
      return;
    }
    if (!member.manageable) {
      await interaction.editReply({
        embeds: [errorEmbed('I cannot manage this member. Move my role above theirs and try again.')],
      });
      return;
    }

    const existing = await fetchActiveJail(interaction.guild.id, target.id);
    if (existing) {
      await interaction.editReply({
        embeds: [errorEmbed(`<@${target.id}> is already jailed. Use \`/jail remove\` first if you want to reset.`)],
      });
      return;
    }

    const role = await ensureJailRole(interaction.guild, cfg.channel_id);
    if (!role) {
      await interaction.editReply({
        embeds: [errorEmbed('Could not prepare the Jailed role. Give me "Manage Roles" and try again.')],
      });
      return;
    }

    const { previousRoles } = await applyJail(interaction.guild, member, role);
    const expiresAt = seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null;

    await recordJail({
      guildId: interaction.guild.id,
      discordId: target.id,
      moderatorId: interaction.user.id,
      reason,
      expiresAt,
      previousRoles,
    });

    await logAndAnnounce(interaction.guild, {
      guildId: interaction.guild.id,
      type: 'mute',
      targetId: target.id,
      moderatorId: interaction.user.id,
      reason: `Jailed → <#${cfg.channel_id}>: ${reason}`,
      durationSeconds: seconds ?? null,
    });

    const jail = await interaction.guild.channels.fetch(cfg.channel_id).catch(() => null);
    if (jail?.isTextBased() && 'send' in jail) {
      const releaseNote = parsed.forLife
        ? '⛓️ **No release date — you are here for life.**'
        : (seconds ? `⏰ Released <t:${Math.floor((Date.now() + seconds * 1000) / 1000)}:R>.` : '⏰ Released whenever a Lord frees you.');
      await jail.send({
        content: `🔒 <@${target.id}> — welcome to **${jail.name}**. You have been jailed ${durLabel}.\n**Reason:** ${reason}\n${releaseNote}`,
        allowedMentions: { users: [target.id] },
      }).catch(() => null);
    }

    await interaction.editReply({
      embeds: [successEmbed(
        `Sent <@${target.id}> to <#${cfg.channel_id}> ${durLabel}. Reason: ${reason}`,
      )],
    });
    return;
  }

  if (sub === 'remove') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const target = interaction.options.getUser('user', true);
    const jailed = await fetchActiveJail(interaction.guild.id, target.id);
    if (!jailed) {
      await interaction.editReply({ embeds: [errorEmbed(`<@${target.id}> is not currently jailed.`)] });
      return;
    }
    const cfg = getJailConfig();
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (member && cfg.role_id) {
      await releaseJail(interaction.guild, member, cfg.role_id, jailed.previous_roles_json ?? []);
    }
    await clearJail(interaction.guild.id, target.id);

    await logAndAnnounce(interaction.guild, {
      guildId: interaction.guild.id,
      type: 'unmute',
      targetId: target.id,
      moderatorId: interaction.user.id,
      reason: 'Released from jail',
    });

    await interaction.editReply({ embeds: [successEmbed(`Released <@${target.id}> from jail.`)] });
    return;
  }

  if (sub === 'status') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const cfg = getJailConfig();
    const lines: string[] = [
      `**Jail channel:** ${cfg.channel_id ? `<#${cfg.channel_id}>` : '_not set_ — run `/jail setup`'}`,
      `**Jailed role:** ${cfg.role_id ? `<@&${cfg.role_id}>` : '_none yet_'}`,
    ];
    await interaction.editReply({ embeds: [pulseEmbed('🔒 Jail').setDescription(lines.join('\n'))] });
    return;
  }
}
