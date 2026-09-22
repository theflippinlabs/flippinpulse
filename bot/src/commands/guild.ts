import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { pulseEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';
import {
  GUILD_CONSTS,
  createGuild,
  getMyGuild,
  guildLeaderboard,
  guildRoster,
  joinGuild,
  leaveGuild,
} from '../services/guilds.js';

const fmt = (n: number) => n.toLocaleString('en-US');

export const data = new SlashCommandBuilder()
  .setName('guild')
  .setDescription('Guilds — subgroups within the server / Guildes — sous-groupes')
  .addSubcommand(s => s.setName('create').setDescription(`Found a guild (${GUILD_CONSTS.CREATE_COST} PULSE) / Fonder une guilde`)
    .addStringOption(o => o.setName('name').setDescription('Name (3-32 chars)').setRequired(true))
    .addStringOption(o => o.setName('tag').setDescription('Short tag (2-6 chars)').setRequired(true))
    .addStringOption(o => o.setName('emoji').setDescription('Emoji').setRequired(false))
    .addStringOption(o => o.setName('motto').setDescription('Motto (max 100)').setRequired(false)))
  .addSubcommand(s => s.setName('join').setDescription('Join a guild by tag / Rejoindre par tag')
    .addStringOption(o => o.setName('tag').setDescription('Guild tag').setRequired(true)))
  .addSubcommand(s => s.setName('leave').setDescription('Leave your guild / Quitter'))
  .addSubcommand(s => s.setName('view').setDescription('View your guild / Voir ta guilde'))
  .addSubcommand(s => s.setName('leaderboard').setDescription('Top guilds by XP / Top guildes'));

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const fr = locale === 'fr';
  const sub = interaction.options.getSubcommand();

  if (sub === 'create') {
    const name = interaction.options.getString('name', true);
    const tag = interaction.options.getString('tag', true);
    const emoji = interaction.options.getString('emoji') ?? '🏰';
    const motto = interaction.options.getString('motto') ?? '';
    const res = await createGuild(interaction.user.id, name, tag, emoji, motto);
    if (!res.ok || !res.guild) {
      const msg = res.error === 'bad_name' ? (fr ? 'Nom entre 3 et 32 caractères.' : 'Name must be 3-32 chars.')
        : res.error === 'bad_tag' ? (fr ? 'Tag entre 2 et 6 caractères.' : 'Tag must be 2-6 chars.')
        : res.error === 'already_in_guild' ? (fr ? 'Tu es déjà dans une guilde.' : 'You are already in a guild.')
        : res.error === 'insufficient_pulse' ? (fr ? 'PULSE insuffisant.' : 'Not enough PULSE.')
        : (fr ? 'Création impossible.' : 'Creation failed.');
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      embeds: [successEmbed(fr
        ? `${res.guild.emoji} **${res.guild.name}** [${res.guild.tag}] fondée ! Coût ${GUILD_CONSTS.CREATE_COST} PULSE.\n\nInvite tes amis avec le tag \`${res.guild.tag}\` : \`/guild join tag:${res.guild.tag}\``
        : `${res.guild.emoji} **${res.guild.name}** [${res.guild.tag}] founded! Cost ${GUILD_CONSTS.CREATE_COST} PULSE.\n\nInvite friends with tag \`${res.guild.tag}\`: \`/guild join tag:${res.guild.tag}\``)],
    });
    return;
  }

  if (sub === 'join') {
    const tag = interaction.options.getString('tag', true);
    const res = await joinGuild(interaction.user.id, tag);
    if (!res.ok || !res.guild) {
      const msg = res.error === 'already_in_guild' ? (fr ? 'Tu es déjà dans une guilde.' : 'Already in a guild.')
        : res.error === 'guild_not_found' ? (fr ? 'Guilde introuvable.' : 'Guild not found.')
        : res.error === 'guild_full' ? (fr ? 'Guilde pleine.' : 'Guild full.')
        : (fr ? 'Impossible de rejoindre.' : 'Join failed.');
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ embeds: [successEmbed(fr ? `${res.guild.emoji} Bienvenue dans **${res.guild.name}** !` : `${res.guild.emoji} Welcome to **${res.guild.name}**!`)] });
    return;
  }

  if (sub === 'leave') {
    const res = await leaveGuild(interaction.user.id);
    if (!res.ok) {
      const msg = res.error === 'not_in_guild' ? (fr ? 'Tu n\'es pas dans une guilde.' : 'You are not in a guild.')
        : res.error === 'leader_cannot_leave' ? (fr ? 'Un leader ne peut pas partir. Cède le rôle ou dissous la guilde.' : "A leader can't leave. Pass leadership or disband first.")
        : (res.error ?? 'error');
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ embeds: [successEmbed(fr ? 'Tu as quitté ta guilde.' : 'You left your guild.')], flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'view') {
    const cur = await getMyGuild(interaction.user.id);
    if (!cur) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Pas de guilde.' : 'No guild.')], flags: MessageFlags.Ephemeral }); return; }
    const roster = await guildRoster(cur.guild.id);
    const lines = roster.slice(0, 20).map((m, i) => `${m.role === 'leader' ? '👑' : `#${i + 1}`} <@${m.discord_id}> · ${fmt(m.xp_contributed)} XP`).join('\n');
    await interaction.reply({
      embeds: [pulseEmbed(`${cur.guild.emoji} ${cur.guild.name} [${cur.guild.tag}]`).setDescription(
        (cur.guild.motto ? `_"${cur.guild.motto}"_\n\n` : '') +
        (fr ? `**XP totale :** ${fmt(cur.guild.total_xp)}\n**Leader :** <@${cur.guild.leader_id}>\n**Membres :** ${roster.length} / ${GUILD_CONSTS.MAX_MEMBERS}\n\n**Roster :**\n${lines}` : `**Total XP:** ${fmt(cur.guild.total_xp)}\n**Leader:** <@${cur.guild.leader_id}>\n**Members:** ${roster.length} / ${GUILD_CONSTS.MAX_MEMBERS}\n\n**Roster:**\n${lines}`)
      )],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'leaderboard') {
    const top = await guildLeaderboard(10);
    if (!top.length) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Aucune guilde encore fondée.' : 'No guilds founded yet.')], flags: MessageFlags.Ephemeral }); return; }
    const medals = ['🥇', '🥈', '🥉'];
    const lines = top.map((g, i) => `${medals[i] ?? `#${i + 1}`} ${g.emoji} **${g.name}** [${g.tag}] — ${fmt(g.total_xp)} XP`).join('\n');
    await interaction.reply({
      embeds: [pulseEmbed(fr ? '🏆 Top guildes' : '🏆 Top guilds').setDescription(lines)],
    });
  }
}
