import { supabase } from '../supabase.js';
import { spendPulse } from './economy.js';

const CREATE_COST = 2000;
const MAX_MEMBERS = 20;

export interface Guild {
  id: number;
  name: string;
  tag: string;
  emoji: string;
  motto: string;
  leader_id: string;
  total_xp: number;
  created_at: string;
}

export interface GuildMember {
  discord_id: string;
  guild_id: number;
  role: 'leader' | 'member';
  joined_at: string;
  xp_contributed: number;
}

export async function getMyGuild(discordId: string): Promise<{ guild: Guild; member: GuildMember } | null> {
  const { data: gm } = await supabase.from('guild_members').select('*').eq('discord_id', discordId).maybeSingle();
  if (!gm) return null;
  const { data: g } = await supabase.from('guilds').select('*').eq('id', (gm as GuildMember).guild_id).maybeSingle();
  if (!g) return null;
  return { guild: g as Guild, member: gm as GuildMember };
}

export async function createGuild(leaderId: string, name: string, tag: string, emoji: string, motto: string): Promise<{ ok: boolean; error?: string; guild?: Guild }> {
  if (name.length < 3 || name.length > 32) return { ok: false, error: 'bad_name' };
  if (tag.length < 2 || tag.length > 6) return { ok: false, error: 'bad_tag' };
  const existing = await getMyGuild(leaderId);
  if (existing) return { ok: false, error: 'already_in_guild' };

  const debit = await spendPulse(leaderId, CREATE_COST, `Guild founding: ${name}`);
  if (!debit.success) return { ok: false, error: debit.error ?? 'debit_failed' };

  const { data: g, error } = await supabase.from('guilds').insert({
    name, tag: tag.toUpperCase(), emoji: emoji.slice(0, 4) || '🏰', motto: motto.slice(0, 100), leader_id: leaderId,
  }).select('*').single();
  if (error || !g) return { ok: false, error: error?.message ?? 'insert_failed' };
  await supabase.from('guild_members').insert({ discord_id: leaderId, guild_id: (g as Guild).id, role: 'leader' });
  return { ok: true, guild: g as Guild };
}

export async function joinGuild(discordId: string, tag: string): Promise<{ ok: boolean; error?: string; guild?: Guild }> {
  const existing = await getMyGuild(discordId);
  if (existing) return { ok: false, error: 'already_in_guild' };
  const { data: g } = await supabase.from('guilds').select('*').eq('tag', tag.toUpperCase()).maybeSingle();
  if (!g) return { ok: false, error: 'guild_not_found' };
  const { count } = await supabase.from('guild_members').select('*', { count: 'exact', head: true }).eq('guild_id', (g as Guild).id);
  if ((count ?? 0) >= MAX_MEMBERS) return { ok: false, error: 'guild_full' };
  await supabase.from('guild_members').insert({ discord_id: discordId, guild_id: (g as Guild).id });
  return { ok: true, guild: g as Guild };
}

export async function leaveGuild(discordId: string): Promise<{ ok: boolean; error?: string }> {
  const cur = await getMyGuild(discordId);
  if (!cur) return { ok: false, error: 'not_in_guild' };
  if (cur.member.role === 'leader') return { ok: false, error: 'leader_cannot_leave' };
  await supabase.from('guild_members').delete().eq('discord_id', discordId);
  return { ok: true };
}

export async function guildLeaderboard(limit = 10): Promise<Guild[]> {
  const { data } = await supabase.from('guilds').select('*').order('total_xp', { ascending: false }).limit(limit);
  return (data ?? []) as Guild[];
}

// Contribute XP to guild (auto-called when a member earns points).
export async function contributeXP(discordId: string, xp: number): Promise<void> {
  if (xp <= 0) return;
  const cur = await getMyGuild(discordId);
  if (!cur) return;
  await supabase.from('guilds').update({ total_xp: cur.guild.total_xp + xp }).eq('id', cur.guild.id);
  await supabase.from('guild_members').update({ xp_contributed: cur.member.xp_contributed + xp }).eq('discord_id', discordId);
}

export async function guildRoster(guildId: number): Promise<GuildMember[]> {
  const { data } = await supabase.from('guild_members').select('*').eq('guild_id', guildId).order('xp_contributed', { ascending: false });
  return (data ?? []) as GuildMember[];
}

export const GUILD_CONSTS = { CREATE_COST, MAX_MEMBERS };
