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
  // Discord-level gate — surfaces the command only to server admins.
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
  )
  .addSubcommand(s =>
    s.setName('sync')
      .setDescription('Import members already wearing the jail role into my DB (life sentence)'),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const locale = await (await import('../i18n.js')).getUserLocale(interaction.user.id);
  const en = locale === 'en';

  if (!interaction.guild) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'Server only.' : 'Uniquement en serveur.')], flags: MessageFlags.Ephemeral });
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
        embeds: [errorEmbed(en
          ? 'Set the channel, but I could not prepare the jail role. Give me the "Manage Roles" permission and try again.'
          : 'Salon défini, mais je n\'ai pas pu préparer le rôle Jail. Donne-moi "Manage Roles" et réessaie.')],
      });
      return;
    }
    await interaction.editReply({
      embeds: [successEmbed(en
        ? `Jail configured. <#${channel.id}> is the jail, and members who go there will be locked to that channel via the <@&${role.id}> role.\n\n⚠️ Make sure the **${role.name}** role is *above* other member roles you want it to override — I already stripped view access from every channel I could manage.`
        : `Jail configuré. <#${channel.id}> est la prison, et les membres qui y vont seront enfermés dans ce salon via le rôle <@&${role.id}>.\n\n⚠️ Assure-toi que le rôle **${role.name}** est *au-dessus* des autres rôles que tu veux override — j'ai déjà retiré l'accès aux salons que je peux gérer.`
      )],
    });
    return;
  }

  if (sub === 'add') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const cfg = getJailConfig();
    if (!cfg.channel_id) {
      await interaction.editReply({ embeds: [errorEmbed(en ? 'Pick the jail channel first with `/jail setup`.' : 'Choisis le salon jail d\'abord avec `/jail setup`.')] });
      return;
    }

    const target = interaction.options.getUser('user', true);
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') ?? (en ? 'No reason provided' : 'Aucune raison donnée');

    const parsed = parseJailDuration(durationStr);
    if (!parsed) {
      await interaction.editReply({
        embeds: [errorEmbed(en
          ? 'Invalid duration. Try `30s`, `10m`, `2h`, `1d`, `1w`, `1mo`, `1y`, or `life`.'
          : 'Durée invalide. Essaie `30s`, `10m`, `2h`, `1d`, `1w`, `1mo`, `1y`, ou `life`.')],
      });
      return;
    }
    const seconds = parsed.seconds;
    const durLabel = parsed.forLife
      ? (en ? 'for **LIFE 🔒**' : 'à **PERPÉTUITÉ 🔒**')
      : (seconds && durationStr
          ? (en ? `for **${durationStr}**` : `pour **${durationStr}**`)
          : (en ? '**indefinitely**' : '**indéfiniment**'));

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      await interaction.editReply({ embeds: [errorEmbed(en ? 'Member not found in this server.' : 'Membre introuvable dans ce serveur.')] });
      return;
    }
    if (member.id === interaction.guild.ownerId) {
      await interaction.editReply({ embeds: [errorEmbed(en ? 'I cannot jail the server owner.' : 'Je ne peux pas jail le propriétaire du serveur.')] });
      return;
    }
    if (member.id === interaction.client.user?.id) {
      await interaction.editReply({ embeds: [errorEmbed(en ? 'Nice try. 😄' : 'Bien essayé. 😄')] });
      return;
    }
    if (!member.manageable) {
      await interaction.editReply({
        embeds: [errorEmbed(en
          ? 'I cannot manage this member. Move my role above theirs and try again.'
          : 'Je ne peux pas gérer ce membre. Déplace mon rôle au-dessus du sien et réessaie.')],
      });
      return;
    }

    const existing = await fetchActiveJail(interaction.guild.id, target.id);
    if (existing) {
      await interaction.editReply({
        embeds: [errorEmbed(en
          ? `<@${target.id}> is already jailed. Use \`/jail remove\` first if you want to reset.`
          : `<@${target.id}> est déjà en prison. Utilise \`/jail remove\` d'abord pour réinitialiser.`)],
      });
      return;
    }

    const role = await ensureJailRole(interaction.guild, cfg.channel_id);
    if (!role) {
      await interaction.editReply({
        embeds: [errorEmbed(en
          ? 'Could not prepare the Jailed role. Give me "Manage Roles" and try again.'
          : 'Impossible de préparer le rôle Jailed. Donne-moi "Manage Roles" et réessaie.')],
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

    // Ping in the jail channel so the inmate's client focuses on it. The
    // greeting reads the INMATE's locale so they get it in their language.
    const jail = await interaction.guild.channels.fetch(cfg.channel_id).catch(() => null);
    if (jail?.isTextBased() && 'send' in jail) {
      const inmateLocale = await (await import('../i18n.js')).getUserLocale(target.id);
      const inen = inmateLocale === 'en';
      const inmateDur = parsed.forLife
        ? (inen ? 'for **LIFE 🔒**' : 'à **PERPÉTUITÉ 🔒**')
        : (seconds && durationStr
            ? (inen ? `for **${durationStr}**` : `pour **${durationStr}**`)
            : (inen ? '**indefinitely**' : '**indéfiniment**'));
      const releaseNote = parsed.forLife
        ? (inen ? '⛓️ **No release date — you are here for life.**' : '⛓️ **Pas de date de sortie — tu es ici à vie.**')
        : (seconds
            ? (inen ? `⏰ Released <t:${Math.floor((Date.now() + seconds * 1000) / 1000)}:R>.` : `⏰ Libéré <t:${Math.floor((Date.now() + seconds * 1000) / 1000)}:R>.`)
            : (inen ? '⏰ Released whenever a Lord frees you.' : '⏰ Libéré quand un Lord te libèrera.'));
      const welcomeLine = inen
        ? `🔒 <@${target.id}> — welcome to **${jail.name}**. You have been jailed ${inmateDur}.`
        : `🔒 <@${target.id}> — bienvenue à **${jail.name}**. Tu es en prison ${inmateDur}.`;
      const reasonLbl = inen ? 'Reason' : 'Raison';
      await jail.send({
        content: `${welcomeLine}\n**${reasonLbl}:** ${reason}\n${releaseNote}`,
        allowedMentions: { users: [target.id] },
      }).catch(() => null);
    }

    await interaction.editReply({
      embeds: [successEmbed(en
        ? `Sent <@${target.id}> to <#${cfg.channel_id}> ${durLabel}. Reason: ${reason}`
        : `<@${target.id}> envoyé à <#${cfg.channel_id}> ${durLabel}. Raison : ${reason}`,
      )],
    });
    return;
  }

  if (sub === 'remove') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const target = interaction.options.getUser('user', true);
    const jailed = await fetchActiveJail(interaction.guild.id, target.id);
    if (!jailed) {
      await interaction.editReply({ embeds: [errorEmbed(en
        ? `<@${target.id}> is not currently jailed.`
        : `<@${target.id}> n'est pas en prison.`)] });
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
      reason: en ? 'Released from jail' : 'Libéré de prison',
    });

    await interaction.editReply({ embeds: [successEmbed(en
      ? `Released <@${target.id}> from jail.`
      : `<@${target.id}> libéré de prison.`)] });
    return;
  }

  if (sub === 'status') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const cfg = getJailConfig();
    const notSetJail = en ? '_not set_ — run `/jail setup`' : '_non défini_ — lance `/jail setup`';
    const noRole = en ? '_none yet_' : '_aucun_';
    const lines: string[] = [
      `**${en ? 'Jail channel' : 'Salon jail'}:** ${cfg.channel_id ? `<#${cfg.channel_id}>` : notSetJail}`,
      `**${en ? 'Jailed role' : 'Rôle Jailed'}:** ${cfg.role_id ? `<@&${cfg.role_id}>` : noRole}`,
    ];
    await interaction.editReply({ embeds: [pulseEmbed('🔒 Jail').setDescription(lines.join('\n'))] });
    return;
  }

  if (sub === 'sync') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const cfg = getJailConfig();
    if (!cfg.role_id) {
      await interaction.editReply({ embeds: [errorEmbed(en
        ? 'No jail role configured yet — run `/jail setup` first.'
        : 'Aucun rôle jail configuré — lance `/jail setup` d\'abord.')] });
      return;
    }
    const role = await interaction.guild.roles.fetch(cfg.role_id).catch(() => null);
    if (!role) {
      await interaction.editReply({ embeds: [errorEmbed(en
        ? `Configured jail role \`${cfg.role_id}\` no longer exists. Re-run \`/jail setup\`.`
        : `Le rôle jail configuré \`${cfg.role_id}\` n'existe plus. Relance \`/jail setup\`.`)] });
      return;
    }

    // Force-populate role.members: fetching guild members is required in large servers.
    await interaction.guild.members.fetch().catch(() => null);

    let imported = 0, skipped = 0;
    for (const member of role.members.values()) {
      if (member.user.bot) continue;
      const existing = await fetchActiveJail(interaction.guild.id, member.id);
      if (existing) { skipped++; continue; }
      await recordJail({
        guildId: interaction.guild.id,
        discordId: member.id,
        moderatorId: interaction.user.id,
        reason: en ? 'Imported by /jail sync (life sentence)' : 'Importé par /jail sync (perpétuité)',
        expiresAt: null,
        previousRoles: [],
      });
      imported++;
    }

    await interaction.editReply({
      embeds: [successEmbed(en
        ? `Sync complete for <@&${role.id}>.\n• **${imported}** member${imported === 1 ? '' : 's'} imported as life sentences.\n• **${skipped}** already tracked (left as-is).\n\nUse \`/jail remove user:@…\` to release any of them.`
        : `Sync terminée pour <@&${role.id}>.\n• **${imported}** membre${imported === 1 ? '' : 's'} importé${imported === 1 ? '' : 's'} à perpétuité.\n• **${skipped}** déjà suivi${skipped === 1 ? '' : 's'} (inchangé).\n\nUtilise \`/jail remove user:@…\` pour libérer un membre.`
      )],
    });
    return;
  }
}
