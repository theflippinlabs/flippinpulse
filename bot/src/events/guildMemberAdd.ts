import { ChannelType, EmbedBuilder, GuildMember } from 'discord.js';
import { supabase } from '../supabase.js';
import { getWelcomeConfig } from '../services/settings.js';
import { recordJoin } from '../services/automod.js';
import { logAndAnnounce } from '../services/moderation.js';
import { log } from '../utils/logger.js';

function parseHexColor(input: string): number {
  const hex = input.replace('#', '');
  const num = parseInt(hex, 16);
  return Number.isFinite(num) ? num : 0x38BDF8;
}

function applyTemplate(template: string, member: GuildMember): string {
  return template
    .replaceAll('{username}', member.user.username)
    .replaceAll('{mention}', `<@${member.id}>`)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{member_count}', String(member.guild.memberCount));
}

async function sendWelcomeMessage(member: GuildMember): Promise<void> {
  const config = getWelcomeConfig();
  if (!config.enabled || !config.channel_id) return;

  const channel = await member.guild.channels.fetch(config.channel_id).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    log('WARN', `Welcome channel ${config.channel_id} unavailable or not a text channel`);
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(parseHexColor(config.embed_color))
    .setTitle(applyTemplate(config.title, member))
    .setDescription(applyTemplate(config.description, member))
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setTimestamp();

  if (config.show_member_count) {
    embed.setFooter({ text: `Member #${member.guild.memberCount}` });
  }

  await channel.send({
    content: config.ping_user ? `<@${member.id}>` : undefined,
    embeds: [embed],
  }).catch(err => log('ERROR', 'Failed to send welcome message', err));
}

export async function handleGuildMemberAdd(member: GuildMember): Promise<void> {
  if (member.user.bot) return;

  const raidState = recordJoin(member.guild.id);
  if (raidState.lockdown) {
    await logAndAnnounce(member.guild, {
      guildId: member.guild.id,
      type: 'automod',
      targetId: member.id,
      reason: `Raid lockdown active — join blocked (${raidState.joinsInWindow} recent joins)`,
      metadata: { trigger: 'raid_lockdown' },
    });
    await member.kick('Automod: raid lockdown').catch(err => log('ERROR', 'Raid kick failed', err));
    return;
  }

  const { error } = await supabase.from('discord_users').upsert({
    discord_id: member.id,
    username: member.user.username,
    avatar_url: member.user.displayAvatarURL({ size: 128 }),
    joined_at: new Date().toISOString(),
  }, { onConflict: 'discord_id' });

  if (error) {
    log('ERROR', `Failed to create user for ${member.id}`, error);
  } else {
    log('INFO', `New member registered: ${member.user.username} (${member.id})`);
  }

  await sendWelcomeMessage(member);
}
