import { ChannelType, EmbedBuilder, GuildMember } from 'discord.js';
import { supabase } from '../supabase.js';
import { runWithGuild } from '../guildContext.js';
import { getWelcomeConfig, type WelcomeConfig } from '../services/settings.js';
import { recordJoin } from '../services/automod.js';
import { logAndAnnounce } from '../services/moderation.js';
import { pulsarWelcomeText, pulsarCelebrate } from '../services/pulsar.js';
import { log } from '../utils/logger.js';

// Round numbers worth a community celebration.
function isMemberMilestone(count: number): boolean {
  if (count <= 0) return false;
  if (count < 100) return count % 25 === 0;
  return count % 100 === 0;
}

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

export function buildWelcomePayload(member: GuildMember, config: WelcomeConfig): { content?: string; embeds: EmbedBuilder[] } {
  const embed = new EmbedBuilder()
    .setColor(parseHexColor(config.embed_color))
    .setTitle(applyTemplate(config.title, member))
    .setDescription(applyTemplate(config.description, member))
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setTimestamp();

  if (config.show_member_count) {
    embed.setFooter({ text: `Member #${member.guild.memberCount}` });
  }

  return {
    content: config.ping_user ? `<@${member.id}>` : undefined,
    embeds: [embed],
  };
}

async function sendWelcomeMessage(member: GuildMember): Promise<void> {
  const config = getWelcomeConfig();
  if (!config.enabled || !config.channel_id) return;

  const channel = await member.guild.channels.fetch(config.channel_id).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    log('WARN', `Welcome channel ${config.channel_id} unavailable or not a text channel`);
    return;
  }

  // Let Pulsar write a personalized welcome when it's available; otherwise
  // fall back to the configured embed so welcomes always go out.
  const pulsarText = await pulsarWelcomeText(member).catch(() => null);
  if (pulsarText) {
    await channel.send({ content: pulsarText, allowedMentions: { users: [member.id], parse: [] } })
      .catch(err => log('ERROR', 'Failed to send Pulsar welcome', err));
    return;
  }

  await channel.send(buildWelcomePayload(member, config))
    .catch(err => log('ERROR', 'Failed to send welcome message', err));
}

export async function handleGuildMemberAdd(member: GuildMember): Promise<void> {
  if (member.user.bot) return;
  await runWithGuild(member.guild.id, () => onGuildMemberAdd(member));
}

async function onGuildMemberAdd(member: GuildMember): Promise<void> {
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
    guild_id: member.guild.id,
    discord_id: member.id,
    username: member.user.username,
    avatar_url: member.user.displayAvatarURL({ size: 128 }),
    joined_at: new Date().toISOString(),
  }, { onConflict: 'guild_id,discord_id' });

  if (error) {
    log('ERROR', `Failed to create user for ${member.id}`, error);
  } else {
    log('INFO', `New member registered: ${member.user.username} (${member.id})`);
  }

  await sendWelcomeMessage(member);

  if (isMemberMilestone(member.guild.memberCount)) {
    void pulsarCelebrate(member.client, `the server just reached ${member.guild.memberCount} members`);
  }
}
