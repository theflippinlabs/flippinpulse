import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  MessageActionRowComponentBuilder,
  TextChannel,
} from 'discord.js';
import { supabase } from '../supabase.js';
import { grantPulse, revokePulse } from './economy.js';
import { clearJail, fetchActiveJail, getJailConfig, releaseJail } from './jail.js';
import { createTournament, listPlayers } from './tournaments.js';
import { endAllChallenges, launchFlash, launchObjective, launchRiddle } from './challenges.js';
import { getPulsarConfig, pulsarPostNow } from './pulsar.js';
import { forceLotteryDraw } from './lottery.js';
import {
  buildEnterRow,
  buildGiveawayEmbed,
  createGiveaway,
  getGiveaway,
  setGiveawayMessage,
} from './giveaways.js';
import { log } from '../utils/logger.js';

interface DashboardCommand {
  id: string;
  command: string;
  payload_json: Record<string, unknown>;
  status: string;
  created_by: string | null;
}

async function markDone(id: string): Promise<void> {
  await supabase
    .from('dashboard_commands')
    .update({ status: 'done', processed_at: new Date().toISOString() })
    .eq('id', id);
}

async function markFailed(id: string, error: string): Promise<void> {
  await supabase
    .from('dashboard_commands')
    .update({ status: 'failed', processed_at: new Date().toISOString(), error: error.slice(0, 500) })
    .eq('id', id);
}

async function handleAnnounce(client: Client, cmd: DashboardCommand): Promise<void> {
  const { channel_id, message, title, embed, ping } = cmd.payload_json as {
    channel_id?: string; message?: string; title?: string; embed?: boolean; ping?: 'everyone' | 'here' | null;
  };
  if (!channel_id || !message) throw new Error('announce: channel_id and message required');
  const channel = await client.channels.fetch(channel_id).catch(() => null);
  if (!channel || !('send' in channel) || !channel.isTextBased()) throw new Error('announce: channel not text-sendable');

  const content = ping === 'everyone' ? '@everyone' : ping === 'here' ? '@here' : undefined;
  const allowedMentions = ping === 'everyone'
    ? { parse: ['everyone' as const] }
    : { parse: [] as never[] };

  if (embed) {
    const eb = new EmbedBuilder()
      .setColor(0x38BDF8)
      .setDescription(message.slice(0, 4000))
      .setTimestamp();
    if (title) eb.setTitle(title.slice(0, 200));
    await channel.send({ content, embeds: [eb], allowedMentions });
  } else {
    await channel.send({ content: `${content ? content + '\n' : ''}${message}`.slice(0, 2000), allowedMentions });
  }
}

async function handleGrantPulse(cmd: DashboardCommand): Promise<void> {
  const { discord_id, amount, reason } = cmd.payload_json as {
    discord_id?: string; amount?: number; reason?: string;
  };
  if (!discord_id || !amount || amount <= 0) throw new Error('grant_pulse: bad payload');

  const { data: existing } = await supabase
    .from('discord_users')
    .select('username, avatar_url')
    .eq('discord_id', discord_id)
    .maybeSingle();

  const res = await grantPulse(
    discord_id,
    (existing?.username as string) ?? 'member',
    (existing?.avatar_url as string) ?? null,
    Math.floor(amount),
    reason ?? 'Dashboard grant',
    cmd.created_by ?? 'dashboard',
  );
  if (!res.success) throw new Error(res.error ?? 'grant failed');
}

async function handleRevokePulse(cmd: DashboardCommand): Promise<void> {
  const { discord_id, amount, reason } = cmd.payload_json as {
    discord_id?: string; amount?: number; reason?: string;
  };
  if (!discord_id || !amount || amount <= 0) throw new Error('revoke_pulse: bad payload');
  const res = await revokePulse(
    discord_id,
    Math.floor(amount),
    reason ?? 'Dashboard revoke',
    cmd.created_by ?? 'dashboard',
  );
  if (!res.success) throw new Error(res.error ?? 'revoke failed');
}

async function handleReleaseJail(client: Client, cmd: DashboardCommand): Promise<void> {
  const { discord_id, guild_id } = cmd.payload_json as { discord_id?: string; guild_id?: string };
  if (!discord_id || !guild_id) throw new Error('release_jail: bad payload');

  const jailed = await fetchActiveJail(guild_id, discord_id);
  if (!jailed) return; // already released, no-op

  const cfg = getJailConfig();
  const guild = await client.guilds.fetch(guild_id).catch(() => null);
  if (!guild) throw new Error('release_jail: guild not found');
  const member = await guild.members.fetch(discord_id).catch(() => null);
  if (member && cfg.role_id) {
    await releaseJail(guild, member, cfg.role_id, jailed.previous_roles_json ?? []);
  }
  await clearJail(guild_id, discord_id);
}

async function handleCreateTournament(client: Client, cmd: DashboardCommand): Promise<void> {
  const { channel_id, title, buy_in, max_players, game_type } = cmd.payload_json as {
    channel_id?: string; title?: string; buy_in?: number; max_players?: number; game_type?: string;
  };
  if (!channel_id || !title || typeof buy_in !== 'number' || typeof max_players !== 'number') {
    throw new Error('create_tournament: bad payload');
  }
  const channel = await client.channels.fetch(channel_id).catch(() => null) as TextChannel | null;
  if (!channel || !channel.isTextBased() || !('guild' in channel)) {
    throw new Error('create_tournament: channel not text-based');
  }

  const t = await createTournament({
    guildId: channel.guildId!,
    title,
    buyIn: buy_in,
    maxPlayers: max_players,
    channelId: channel_id,
    createdBy: cmd.created_by ?? 'dashboard',
  });
  if (!t) throw new Error('create_tournament: DB insert failed');

  // Best-effort — column may or may not exist yet.
  if (game_type) {
    const { error: gtErr } = await supabase.from('tournaments').update({ game_type }).eq('id', t.id);
    if (gtErr) log('WARN', 'create_tournament: could not set game_type', gtErr);
  }

  // Post the lobby message with Join / Start / Cancel buttons.
  const players = await listPlayers(t.id);
  const embed = new EmbedBuilder()
    .setColor(0x9F7AEA)
    .setTitle(`🏟️ ${t.title}`)
    .setDescription(
      `**Buy-in:** ${t.buy_in} PULSE · **Pot:** ${t.pot_pulse} PULSE\n` +
      `**Players:** ${players.length} / ${t.max_players}\n\n` +
      '_No one yet — press Join!_',
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

async function handleNovusPostNow(client: Client): Promise<void> {
  const cfg = getPulsarConfig();
  if (!cfg.enabled) throw new Error('novus_post_now: Novus is OFF');
  if (!cfg.channel_id) throw new Error('novus_post_now: no channel set');
  const channel = await client.channels.fetch(cfg.channel_id).catch(() => null);
  if (!channel || !('guild' in channel)) throw new Error('novus_post_now: channel not found');
  const guildId = (channel as { guildId: string | null }).guildId;
  if (!guildId) throw new Error('novus_post_now: not in a guild');
  const ok = await pulsarPostNow(client, guildId);
  if (!ok) throw new Error('pulsarPostNow returned false');
}

async function handleLaunchMission(client: Client, cmd: DashboardCommand): Promise<void> {
  const { kind } = cmd.payload_json as { kind?: 'flash' | 'riddle' | 'daily' | 'weekly' };
  if (!kind) throw new Error('launch_mission: kind required');
  const cfg = getPulsarConfig();
  const ch = cfg.channel_id;
  if (!ch) throw new Error('launch_mission: set the Novus channel first');
  if (kind === 'flash') {
    const ok = await launchFlash(client, ch, { reward: 50, maxWinners: 3, durationMin: 30 });
    if (!ok) throw new Error('launchFlash failed');
  } else if (kind === 'riddle') {
    const ok = await launchRiddle(client, ch, { reward: 100, durationMin: 60 });
    if (!ok) throw new Error('launchRiddle failed');
  } else if (kind === 'daily') {
    const ok = await launchObjective(client, ch, { kind: 'daily', metric: 'messages', goal: 20, reward: 60 });
    if (!ok) throw new Error('launchObjective failed');
  } else if (kind === 'weekly') {
    const ok = await launchObjective(client, ch, { kind: 'weekly', metric: 'games_played', goal: 5, reward: 250 });
    if (!ok) throw new Error('launchObjective failed');
  }
}

async function handleEndAllMissions(client: Client): Promise<void> {
  await endAllChallenges(client);
}

async function handleCreateGiveaway(client: Client, cmd: DashboardCommand): Promise<void> {
  const { channel_id, prize_label, prize_pulse, winners_count, duration_minutes } = cmd.payload_json as {
    channel_id?: string;
    prize_label?: string;
    prize_pulse?: number;
    winners_count?: number;
    duration_minutes?: number;
  };
  if (!channel_id) throw new Error('create_giveaway: channel_id required');
  if (typeof prize_pulse !== 'number' || prize_pulse <= 0) throw new Error('create_giveaway: prize_pulse required');
  if (typeof winners_count !== 'number' || winners_count < 1) throw new Error('create_giveaway: winners_count required');
  if (typeof duration_minutes !== 'number' || duration_minutes < 1) throw new Error('create_giveaway: duration_minutes required');

  const channel = await client.channels.fetch(channel_id).catch(() => null) as TextChannel | null;
  if (!channel || !channel.isTextBased() || !('guild' in channel)) {
    throw new Error('create_giveaway: channel not text-based');
  }
  const label = prize_label?.trim() || `${prize_pulse} PULSE`;

  const giveawayId = await createGiveaway({
    guildId: channel.guildId!,
    channelId: channel_id,
    hostId: cmd.created_by ?? 'dashboard',
    prize: label,
    prizePulse: Math.floor(prize_pulse),
    winnersCount: winners_count,
    durationMs: duration_minutes * 60_000,
  });
  if (!giveawayId) throw new Error('create_giveaway: DB insert failed');

  const g = await getGiveaway(giveawayId);
  if (!g) throw new Error('create_giveaway: lookup failed after creation');

  const embed = buildGiveawayEmbed(g, 0);
  const message = await channel.send({ embeds: [embed], components: [buildEnterRow()] });
  await setGiveawayMessage(giveawayId, message.id);
}

async function handleBulkDrop(client: Client, cmd: DashboardCommand): Promise<void> {
  const { channel_id, amount, winners_count, scope } = cmd.payload_json as {
    channel_id?: string;
    amount?: number;
    winners_count?: number;
    scope?: 'active_week' | 'top_50' | 'all';
  };
  if (!channel_id) throw new Error('bulk_drop: channel_id required');
  if (typeof amount !== 'number' || amount <= 0) throw new Error('bulk_drop: amount required');
  if (typeof winners_count !== 'number' || winners_count < 1) throw new Error('bulk_drop: winners_count required');

  const channel = await client.channels.fetch(channel_id).catch(() => null) as TextChannel | null;
  if (!channel || !channel.isTextBased()) throw new Error('bulk_drop: channel not text-based');

  // Pick the candidate pool by scope. "all" is capped at 500 to keep it sane.
  let query = supabase.from('discord_users').select('discord_id, username, avatar_url');
  if (scope === 'active_week') {
    query = query.order('points_week', { ascending: false }).limit(200);
  } else if (scope === 'top_50') {
    query = query.order('points_total', { ascending: false }).limit(50);
  } else {
    query = query.limit(500);
  }
  const { data: candidates } = await query;
  const pool = (candidates ?? []) as Array<{ discord_id: string; username: string; avatar_url: string | null }>;
  if (!pool.length) throw new Error('bulk_drop: no eligible members');

  // Pick winners_count random members without replacement.
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const winners = shuffled.slice(0, Math.min(winners_count, shuffled.length));

  for (const w of winners) {
    try {
      await grantPulse(
        w.discord_id,
        w.username ?? 'member',
        w.avatar_url,
        Math.floor(amount),
        'Reserve drop from dashboard',
        cmd.created_by ?? 'dashboard',
      );
    } catch (err) {
      log('ERROR', `bulk_drop: grant to ${w.discord_id} failed`, err);
    }
  }

  const mentions = winners.map(w => `<@${w.discord_id}>`).join(' ');
  const embed = new EmbedBuilder()
    .setColor(0xF5B62E)
    .setTitle(`💸 PULSE Drop — ${amount.toLocaleString('en-US')} each`)
    .setDescription(`${winners.length} winner${winners.length > 1 ? 's' : ''} just got **${amount} PULSE** each from the reserve.`)
    .addFields({ name: 'Winners', value: mentions.slice(0, 1000) })
    .setTimestamp();
  await channel.send({ content: mentions, embeds: [embed] }).catch(() => null);
}

async function fetchUsername(client: Client, discordId: string): Promise<string> {
  try {
    const user = await client.users.fetch(discordId);
    return user.username;
  } catch { return discordId.slice(-6); }
}

async function handlePetChallenge(client: Client, cmd: DashboardCommand): Promise<void> {
  const p = cmd.payload_json as { challenger_id: string; opponent_id: string; wager: number; channel_id: string };
  const { openChallenge } = await import('./pets.js');
  const { getUserLocale } = await import('../i18n.js');
  const [locale, challengerName] = await Promise.all([
    getUserLocale(p.challenger_id),
    fetchUsername(client, p.challenger_id),
  ]);
  const fr = locale === 'fr';
  const res = await openChallenge(p.challenger_id, challengerName, p.opponent_id, p.wager, !fr);
  if (!res.ok || !res.challengeId || !res.challenger) throw new Error(res.error ?? 'open_failed');
  const channel = await client.channels.fetch(p.channel_id).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased() || !channel.isSendable()) throw new Error('channel_not_sendable');
  const desc = fr
    ? `<@${p.opponent_id}> tu es défié·e par ${res.challenger.emoji} **${res.challenger.name}** (Lv.${res.challenger.level}) de <@${p.challenger_id}> !\n\n💰 Mise : **${p.wager} PULSE** chacun · Pot : **${p.wager * 2} PULSE**\n\n_Le défi expire dans 3 min._`
    : `<@${p.opponent_id}> you have been challenged by ${res.challenger.emoji} **${res.challenger.name}** (Lv.${res.challenger.level}) from <@${p.challenger_id}>!\n\n💰 Wager: **${p.wager} PULSE** each · Pot: **${p.wager * 2} PULSE**\n\n_Challenge expires in 3 min._`;
  const embed = new EmbedBuilder()
    .setColor(0xF5B62E)
    .setTitle(fr ? '⚔️ Défi entre compagnons !' : '⚔️ Pet challenge!')
    .setDescription(desc);
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`petpvp:accept:${res.challengeId}`).setLabel(fr ? 'Accepter' : 'Accept').setEmoji('⚔️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`petpvp:decline:${res.challengeId}`).setLabel(fr ? 'Refuser' : 'Decline').setEmoji('🏳️').setStyle(ButtonStyle.Danger),
  );
  await (channel as TextChannel).send({ embeds: [embed], components: [row], allowedMentions: { users: [p.opponent_id] } });
}

async function handleCardChallenge(client: Client, cmd: DashboardCommand): Promise<void> {
  const p = cmd.payload_json as {
    challenger_id: string;
    opponent_id: string;
    character_code?: string;
    equipment?: { code: string; level: number }[];
    // Older builds only sent codes; keep a fallback path so an in-flight
    // command from a pre-refactor web version still resolves.
    equipment_codes?: string[];
    card_code?: string;
    wager: number;
    channel_id: string;
  };
  const { openCardChallenge, effectiveStats, RARITY_STYLE } = await import('./tcg.js');
  const { getUserLocale } = await import('../i18n.js');
  const [locale, challengerName] = await Promise.all([
    getUserLocale(p.challenger_id),
    fetchUsername(client, p.challenger_id),
  ]);
  const fr = locale === 'fr';
  const characterCode = p.character_code ?? p.card_code ?? '';
  const equipment = Array.isArray(p.equipment)
    ? p.equipment.map(e => ({ code: e.code, level: e.level ?? 1 }))
    : Array.isArray(p.equipment_codes)
      ? p.equipment_codes.map(code => ({ code, level: 1 }))
      : [];
  const res = await openCardChallenge(p.challenger_id, challengerName, p.opponent_id, characterCode, equipment, p.wager);
  if (!res.ok || !res.challengeId || !res.challengerCard) throw new Error(res.error ?? 'open_failed');
  const cc = res.challengerCard;
  const eq = res.challengerEquip ?? [];
  const stats = effectiveStats(cc, eq);
  const rst = RARITY_STYLE[cc.rarity];
  const channel = await client.channels.fetch(p.channel_id).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased() || !channel.isSendable()) throw new Error('channel_not_sendable');
  const equipLine = eq.length
    ? `\n${fr ? '🎽 Équipement' : '🎽 Equipment'} : ${eq.map(e => `${e.card.emoji} ${e.card.name}${e.level > 1 ? ` \`lv${e.level}\`` : ''}`).join(' · ')}`
    : '';
  const desc = fr
    ? `<@${p.opponent_id}> tu es défié·e par <@${p.challenger_id}> !\n\nSon champion : ${rst.emoji} ${cc.emoji} **${cc.name}** _(${cc.rarity})_${equipLine}\n⚔️ ATK ${stats.attack} · 🛡️ DEF ${stats.defense} · 💨 SPD ${stats.speed}\n\n💰 Mise : **${p.wager} PULSE** chacun · Pot : **${p.wager * 2} PULSE**\n\n_Clique **Accepter** pour choisir ton champion et jusqu'à 6 équipements (1 par slot). Expire dans 3 min._`
    : `<@${p.opponent_id}> you have been challenged by <@${p.challenger_id}>!\n\nTheir champion: ${rst.emoji} ${cc.emoji} **${cc.name}** _(${cc.rarity})_${equipLine}\n⚔️ ATK ${stats.attack} · 🛡️ DEF ${stats.defense} · 💨 SPD ${stats.speed}\n\n💰 Wager: **${p.wager} PULSE** each · Pot: **${p.wager * 2} PULSE**\n\n_Tap **Accept** to pick your champion and up to 6 equipment items (1 per slot). Expires in 3 min._`;
  const embed = new EmbedBuilder()
    .setColor(0xF5B62E)
    .setTitle(fr ? '🎴 Duel de cartes !' : '🎴 Card duel!')
    .setDescription(desc);
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`tcgpvp:accept:${res.challengeId}`).setLabel(fr ? 'Accepter' : 'Accept').setEmoji('⚔️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`tcgpvp:decline:${res.challengeId}`).setLabel(fr ? 'Refuser' : 'Decline').setEmoji('🏳️').setStyle(ButtonStyle.Danger),
  );
  await (channel as TextChannel).send({ embeds: [embed], components: [row], allowedMentions: { users: [p.opponent_id] } });
}

async function processOne(client: Client, cmd: DashboardCommand): Promise<void> {
  try {
    if (cmd.command === 'announce') await handleAnnounce(client, cmd);
    else if (cmd.command === 'grant_pulse') await handleGrantPulse(cmd);
    else if (cmd.command === 'revoke_pulse') await handleRevokePulse(cmd);
    else if (cmd.command === 'release_jail') await handleReleaseJail(client, cmd);
    else if (cmd.command === 'create_tournament') await handleCreateTournament(client, cmd);
    else if (cmd.command === 'novus_post_now') await handleNovusPostNow(client);
    else if (cmd.command === 'launch_mission') await handleLaunchMission(client, cmd);
    else if (cmd.command === 'end_all_missions') await handleEndAllMissions(client);
    else if (cmd.command === 'force_lottery_draw') {
      const ok = await forceLotteryDraw(client);
      if (!ok) throw new Error('force_lottery_draw: no active round');
    }
    else if (cmd.command === 'create_giveaway') await handleCreateGiveaway(client, cmd);
    else if (cmd.command === 'bulk_drop') await handleBulkDrop(client, cmd);
    else if (cmd.command === 'pet_challenge') await handlePetChallenge(client, cmd);
    else if (cmd.command === 'card_challenge') await handleCardChallenge(client, cmd);
    else throw new Error(`Unknown command: ${cmd.command}`);
    await markDone(cmd.id);
    log('INFO', `Dashboard cmd ${cmd.command} ${cmd.id} done`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('ERROR', `Dashboard cmd ${cmd.command} ${cmd.id} failed`, err);
    await markFailed(cmd.id, msg);
  }
}

let bridgeInterval: ReturnType<typeof setInterval> | null = null;

export function startDashboardBridge(client: Client, intervalMs = 15_000): void {
  const tick = async () => {
    try {
      const { data } = await supabase
        .from('dashboard_commands')
        .select('id, command, payload_json, status, created_by')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(10);
      for (const row of (data ?? []) as DashboardCommand[]) {
        await processOne(client, row);
      }
    } catch (err) {
      log('ERROR', 'Dashboard bridge tick failed', err);
    }
  };
  void tick();
  bridgeInterval = setInterval(() => void tick(), intervalMs);
}

export function stopDashboardBridge(): void {
  if (bridgeInterval) clearInterval(bridgeInterval);
}
