import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Interaction,
  MessageActionRowComponentBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { supabase } from '../supabase.js';
import { getRankForPoints } from '../services/ranks.js';
import { getActiveMissions, completeMission } from '../services/missions.js';
import { applyDailyStreak } from '../services/streak.js';
import { earnPulse } from '../services/games.js';
import { getEconomyConfig } from '../services/settings.js';
import { getStatus as getLotteryStatus, buyTickets } from '../services/lottery.js';
import { recordChallengeMetric } from '../services/challenges.js';
import { runSlots } from './slots.js';
import { runCrash } from './crash.js';
import { runBlackjack } from './blackjack.js';
import { runWheel } from './wheel.js';
import { runHigherLower } from './higherlower.js';
import { pulseEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';
import { log } from '../utils/logger.js';

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

// ---- FR/EN ----
function isFR(interaction: { locale?: string }): boolean {
  return (interaction.locale ?? 'fr').startsWith('fr');
}

function t(interaction: { locale?: string }, fr: string, en: string): string {
  return isFR(interaction) ? fr : en;
}

// ---- Nav ----
function navRows(): Row[] {
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('hub:home').setEmoji('🏠').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('hub:profil').setLabel('Profil').setEmoji('💰').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('hub:jeux').setLabel('Jeux').setEmoji('🎮').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('hub:missions').setLabel('Missions').setEmoji('🎯').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('hub:shop').setLabel('Boutique').setEmoji('🎁').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('hub:lottery').setLabel('Loterie').setEmoji('🎫').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('hub:leaderboard').setLabel('Classement').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('hub:daily').setLabel('Daily').setEmoji('🎁').setStyle(ButtonStyle.Success),
    ),
  ];
}

// ---- Helpers ----
function progressBar(current: number, target: number, width = 12): string {
  if (target <= 0) return '';
  const pct = Math.max(0, Math.min(1, current / target));
  const filled = Math.round(pct * width);
  return `\`${'▓'.repeat(filled)}${'░'.repeat(width - filled)}\` ${current}/${target}`;
}

function timeUntil(iso: string, fr: boolean): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return fr ? 'imminent' : 'any moment';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function hoursSince(iso: string | null): number {
  if (!iso) return 999;
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

// Cache slash command IDs so we render clickable command chips.
let cmdIdCache: Map<string, string> | null = null;
async function loadCmdIds(interaction: Interaction): Promise<Map<string, string>> {
  if (cmdIdCache && cmdIdCache.size) return cmdIdCache;
  const cache = new Map<string, string>();
  const guildCmds = await interaction.guild?.commands.fetch().catch(() => null);
  if (guildCmds) for (const [id, cmd] of guildCmds) cache.set(cmd.name, id);
  if (!cache.size) {
    const globalCmds = await interaction.client.application?.commands.fetch().catch(() => null);
    if (globalCmds) for (const [id, cmd] of globalCmds) cache.set(cmd.name, id);
  }
  cmdIdCache = cache;
  return cache;
}
function mention(name: string, ids: Map<string, string>): string {
  const id = ids.get(name);
  return id ? `</${name}:${id}>` : `\`/${name}\``;
}

// ---- Views ----
async function renderHome(interaction: Interaction, discordId: string): Promise<{ embeds: ReturnType<typeof pulseEmbed>[]; components: Row[] }> {
  const fr = isFR(interaction);
  const { data: user } = await supabase
    .from('discord_users')
    .select('balance_pulse, points_total, rank_name, streak, last_daily_at')
    .eq('discord_id', discordId)
    .maybeSingle();

  const balance = user?.balance_pulse ?? 0;
  const points = user?.points_total ?? 0;
  const rankNow = getRankForPoints(points);
  const rankNext = getRankForPoints(points + 1); // may equal current
  // Find NEXT-tier rank by looking at all ranks with threshold > current threshold
  // Simplified: reuse getRankForPoints; if next threshold same as current, no upgrade in sight.
  const streak = user?.streak ?? 0;
  const dailyH = hoursSince(user?.last_daily_at ?? null);
  const dailyReady = dailyH >= 24;

  // Count active pulse missions (community objectives)
  const { count: missionCount } = await supabase
    .from('pulse_challenges')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');

  const lottery = await getLotteryStatus(discordId).catch(() => null);

  const lines: string[] = [];
  lines.push(fr ? `💰 **Solde :** ${balance} PULSE` : `💰 **Balance:** ${balance} PULSE`);
  lines.push(fr ? `🏆 **Rang :** ${rankNow?.rank_name ?? '—'}` : `🏆 **Rank:** ${rankNow?.rank_name ?? '—'}`);
  if (rankNext && rankNext.threshold > (rankNow?.threshold ?? 0)) {
    lines.push(`   ${progressBar(points, rankNext.threshold)}  ${fr ? `→ ${rankNext.rank_name}` : `→ ${rankNext.rank_name}`}`);
  }
  lines.push(fr ? `🔥 **Série :** ${streak} jour${streak === 1 ? '' : 's'}` : `🔥 **Streak:** ${streak} day${streak === 1 ? '' : 's'}`);
  lines.push(fr
    ? `🎁 **Daily :** ${dailyReady ? '**prêt à réclamer ✅**' : `dans ${Math.ceil(24 - dailyH)}h`}`
    : `🎁 **Daily:** ${dailyReady ? '**ready to claim ✅**' : `in ${Math.ceil(24 - dailyH)}h`}`);
  lines.push(fr ? `🎯 **Missions actives :** ${missionCount ?? 0}` : `🎯 **Active missions:** ${missionCount ?? 0}`);
  if (lottery) {
    lines.push(fr
      ? `🎰 **Loterie :** ${lottery.pot} PULSE — tirage dans ${timeUntil(lottery.drawAt, true)}`
      : `🎰 **Lottery:** ${lottery.pot} PULSE — draw in ${timeUntil(lottery.drawAt, false)}`);
  }
  lines.push('');
  lines.push(fr ? '_Choisis une section ci-dessous 👇_' : '_Pick a section below 👇_');

  return {
    embeds: [pulseEmbed(fr ? '🏠 NOVARYS — Ton hub' : '🏠 NOVARYS — Your hub').setDescription(lines.join('\n'))],
    components: navRows(),
  };
}

async function renderProfil(interaction: Interaction, discordId: string): Promise<{ embeds: ReturnType<typeof pulseEmbed>[]; components: Row[] }> {
  const fr = isFR(interaction);
  const { data: user } = await supabase.from('discord_users').select('*').eq('discord_id', discordId).maybeSingle();
  if (!user) {
    return {
      embeds: [errorEmbed(fr ? 'Profil introuvable — sois actif un peu et reviens !' : 'Profile not found — be active a bit and come back!')],
      components: navRows(),
    };
  }
  const points = user.points_total ?? 0;
  const rankNow = getRankForPoints(points);
  const rankNext = getRankForPoints(points + 1);
  const bar = rankNext && rankNext.threshold > (rankNow?.threshold ?? 0) ? `\n${progressBar(points, rankNext.threshold)} → **${rankNext.rank_name}**` : '';

  const embed = pulseEmbed(fr ? `Profil — ${user.username}` : `Profile — ${user.username}`)
    .setDescription(
      (fr ? `🏆 **Rang :** ${user.rank_name ?? '—'}` : `🏆 **Rank:** ${user.rank_name ?? '—'}`) + bar
    )
    .addFields(
      { name: fr ? 'Points' : 'Points', value: `${points}`, inline: true },
      { name: fr ? 'Semaine' : 'Weekly', value: `${user.points_week ?? 0}`, inline: true },
      { name: fr ? 'Mois' : 'Monthly', value: `${user.points_month ?? 0}`, inline: true },
      { name: 'PULSE', value: `${user.balance_pulse ?? 0}`, inline: true },
      { name: fr ? 'Gagnés au total' : 'Lifetime earned', value: `${user.lifetime_earned_pulse ?? 0}`, inline: true },
      { name: fr ? 'Dépensés au total' : 'Lifetime spent', value: `${user.lifetime_spent_pulse ?? 0}`, inline: true },
      { name: '🔥 ' + (fr ? 'Série' : 'Streak'), value: `${user.streak ?? 0} ${fr ? 'jours' : 'days'}`, inline: true },
    );
  return { embeds: [embed], components: navRows() };
}

async function renderJeux(interaction: Interaction): Promise<{ embeds: ReturnType<typeof pulseEmbed>[]; components: Row[] }> {
  const fr = isFR(interaction);
  const ids = await loadCmdIds(interaction);
  const line = (name: string, emoji: string, desc: string) => `${emoji} ${mention(name, ids)} — ${desc}`;
  const description = [
    fr ? '**⚡ Lance en 1 tap** (mise via fenêtre)' : '**⚡ One-tap play** (bet via window)',
    fr ? '_Utilise les boutons ci-dessous pour les jeux solo._' : '_Use the buttons below for solo games._',
    '',
    fr ? '**🎯 Solo**' : '**🎯 Solo**',
    line('higherlower', '🎲', fr ? 'Plus ou Moins' : 'Higher or Lower'),
    line('crash', '💥', fr ? 'Cash out avant le crash' : 'Cash out before the crash'),
    line('slots', '🎰', fr ? 'Machine à sous' : 'Slot machine'),
    line('roulette', '🎡', fr ? 'Roulette européenne' : 'European roulette'),
    line('blackjack', '🃏', fr ? 'Face au croupier' : 'Vs the dealer'),
    line('wheel', '🎡', fr ? 'Roue Gacha (jusqu\'à ×25)' : 'Gacha wheel (up to ×25)'),
    line('quiz', '🧠', fr ? 'Quiz solo' : 'Solo quiz'),
    '',
    fr ? '**⚔️ 1v1**' : '**⚔️ 1v1**',
    line('duel', '⚔️', fr ? 'Défie un joueur' : 'Challenge a player'),
    line('rps', '✊', fr ? 'Pierre-Feuille-Ciseaux' : 'Rock-Paper-Scissors'),
    line('typingrace', '⌨️', fr ? 'Course de frappe' : 'Typing race'),
    '',
    fr ? '**🏟️ Multijoueur (lobby)**' : '**🏟️ Multiplayer (lobby)**',
    line('battleroyale', '🏆', fr ? 'Le dernier survivant rafle la cagnotte' : 'Last one standing takes the pot'),
    line('diceroyale', '🎲', fr ? 'Le plus haut score gagne' : 'Highest roll wins'),
    '',
    fr ? '**🎁 Autres**' : '**🎁 Others**',
    line('treasure', '💰', fr ? 'Chasse au trésor' : 'Treasure hunt'),
    line('lottery', '🎫', fr ? 'Loterie' : 'Lottery'),
  ].join('\n');
  const quickRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId('hub:play:slots').setLabel('Slots').setEmoji('🎰').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('hub:play:blackjack').setLabel('Blackjack').setEmoji('🃏').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('hub:play:crash').setLabel('Crash').setEmoji('💥').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('hub:play:wheel').setLabel('Wheel').setEmoji('🎡').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('hub:play:higherlower').setLabel('H/L').setEmoji('🎲').setStyle(ButtonStyle.Success),
  );
  return {
    embeds: [pulseEmbed(fr ? '🎮 Salle des jeux' : '🎮 Games Room').setDescription(description)],
    components: [quickRow, ...navRows()],
  };
}

async function renderMissions(interaction: Interaction): Promise<{ embeds: ReturnType<typeof pulseEmbed>[]; components: Row[] }> {
  const fr = isFR(interaction);
  const { data: active } = await supabase
    .from('pulse_challenges').select('title, description, kind, reward, goal, metric')
    .eq('status', 'active').order('created_at', { ascending: false }).limit(10);
  const lines = (active ?? []).map(m =>
    `• **${m.title}** (${m.kind}) — ${m.reward} PULSE${m.goal ? ` · but ${m.goal}` : ''}`
  );
  const desc = lines.length
    ? lines.join('\n')
    : (fr ? 'Aucune mission active pour l\'instant. Reviens plus tard !' : 'No active missions right now. Check back later!');
  return {
    embeds: [pulseEmbed(fr ? '🎯 Missions actives' : '🎯 Active missions').setDescription(desc)],
    components: navRows(),
  };
}

async function renderShop(interaction: Interaction): Promise<{ embeds: ReturnType<typeof pulseEmbed>[]; components: Row[] }> {
  const fr = isFR(interaction);
  const ids = await loadCmdIds(interaction);
  const { data: items } = await supabase
    .from('shop_items').select('name, description, price_pulse, category, stock_remaining')
    .eq('is_active', true).order('price_pulse', { ascending: true }).limit(12);
  const lines = (items ?? []).map(i => {
    const stock = i.stock_remaining !== null ? ` · ${i.stock_remaining} ${fr ? 'restants' : 'left'}` : '';
    return `**${i.name}** — ${i.price_pulse} PULSE · ${i.category}${stock}\n_${(i.description ?? '').slice(0, 100)}_`;
  });
  const desc = lines.length
    ? lines.join('\n\n')
    : (fr ? 'La boutique est vide pour l\'instant.' : 'Shop is empty for now.');
  const buyLine = fr
    ? `\n\n💡 Achète avec ${mention('buy', ids)} <nom>`
    : `\n\n💡 Buy with ${mention('buy', ids)} <name>`;
  return {
    embeds: [pulseEmbed(fr ? '🎁 Boutique' : '🎁 Shop').setDescription(desc + buyLine)],
    components: navRows(),
  };
}

async function renderLottery(interaction: Interaction, discordId: string): Promise<{ embeds: ReturnType<typeof pulseEmbed>[]; components: Row[] }> {
  const fr = isFR(interaction);
  const st = await getLotteryStatus(discordId);
  if (!st) {
    return {
      embeds: [errorEmbed(fr ? 'Pas de loterie active pour l\'instant.' : 'No active lottery right now.')],
      components: navRows(),
    };
  }
  const odds = st.totalTickets > 0 ? ((st.userTickets / st.totalTickets) * 100).toFixed(1) : '0';
  const embed = pulseEmbed(fr ? '🎰 Loterie PULSE' : '🎰 PULSE Lottery').setDescription(
    (fr ? `💰 **Jackpot :** ${st.pot} PULSE\n` : `💰 **Jackpot:** ${st.pot} PULSE\n`) +
    (fr ? `🎟️ **Prix du ticket :** ${st.ticketPrice} PULSE\n` : `🎟️ **Ticket price:** ${st.ticketPrice} PULSE\n`) +
    (fr ? `🎫 **Tickets en jeu :** ${st.totalTickets}\n` : `🎫 **Tickets in play:** ${st.totalTickets}\n`) +
    (fr ? `⏳ **Tirage dans :** ${timeUntil(st.drawAt, true)}\n\n` : `⏳ **Draw in:** ${timeUntil(st.drawAt, false)}\n\n`) +
    (fr ? `**Tes tickets :** ${st.userTickets} (${odds}% de chances)` : `**Your tickets:** ${st.userTickets} (${odds}% chance)`),
  );
  const buyRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId('hub:lotto:1').setLabel(fr ? 'Acheter 1' : 'Buy 1').setEmoji('🎟️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('hub:lotto:5').setLabel(fr ? 'Acheter 5' : 'Buy 5').setEmoji('🎟️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('hub:lotto:10').setLabel(fr ? 'Acheter 10' : 'Buy 10').setEmoji('🎟️').setStyle(ButtonStyle.Success),
  );
  return { embeds: [embed], components: [buyRow, ...navRows()] };
}

async function renderLeaderboard(interaction: Interaction, sortBy: 'total' | 'week' | 'month' = 'total'): Promise<{ embeds: ReturnType<typeof pulseEmbed>[]; components: Row[] }> {
  const fr = isFR(interaction);
  const col = sortBy === 'week' ? 'points_week' : sortBy === 'month' ? 'points_month' : 'points_total';
  const { data: top } = await supabase
    .from('discord_users').select(`username, ${col}, balance_pulse, rank_name`)
    .order(col, { ascending: false }).limit(10);
  const medals = ['🥇', '🥈', '🥉'];
  const rows = (top ?? []).map((u, i) => {
    const pts = (u as Record<string, unknown>)[col] as number ?? 0;
    return `${medals[i] ?? `${i + 1}.`} **${u.username}** — ${pts} pts · ${u.balance_pulse ?? 0} PULSE`;
  });
  const desc = rows.length ? rows.join('\n') : (fr ? 'Personne au classement encore.' : 'Nobody on the board yet.');
  const title = sortBy === 'week' ? (fr ? '🏆 Top de la semaine' : '🏆 Top of the week')
    : sortBy === 'month' ? (fr ? '🏆 Top du mois' : '🏆 Top of the month')
    : (fr ? '🏆 Top global' : '🏆 Global top');
  const toggleRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId('hub:lb:week').setLabel(fr ? 'Semaine' : 'Week').setStyle(sortBy === 'week' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('hub:lb:month').setLabel(fr ? 'Mois' : 'Month').setStyle(sortBy === 'month' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('hub:lb:total').setLabel(fr ? 'Global' : 'All-time').setStyle(sortBy === 'total' ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
  return { embeds: [pulseEmbed(title).setDescription(desc)], components: [toggleRow, ...navRows()] };
}

async function claimDaily(interaction: Interaction, discordId: string): Promise<{ embeds: ReturnType<typeof pulseEmbed>[]; components: Row[] }> {
  const fr = isFR(interaction);
  const dailies = await getActiveMissions('daily');
  if (!dailies.length) {
    return { embeds: [errorEmbed(fr ? 'Aucune mission daily active.' : 'No daily mission active.')], components: navRows() };
  }
  const mission = dailies[0];
  const { data: userRow } = await supabase
    .from('discord_users')
    .select('last_daily_at')
    .eq('discord_id', discordId)
    .maybeSingle();
  const hSince = hoursSince(userRow?.last_daily_at ?? null);
  if (hSince < 24) {
    const remain = Math.ceil(24 - hSince);
    return {
      embeds: [errorEmbed(fr ? `Déjà réclamé — reviens dans ${remain}h.` : `Already claimed — come back in ${remain}h.`)],
      components: navRows(),
    };
  }
  const ok = await completeMission(discordId, mission.id, mission.reward_points, { allowRepeat: true });
  if (!ok) {
    return { embeds: [errorEmbed(fr ? 'Impossible de réclamer la récompense.' : 'Could not claim the reward.')], components: navRows() };
  }
  const economy = getEconomyConfig();
  const basePulse = mission.reward_points * economy.pulse_per_point;
  const streak = await applyDailyStreak(discordId, basePulse);
  if (streak.bonusPulse > 0) {
    await earnPulse(discordId, streak.bonusPulse, `Daily streak bonus (${streak.streak}d, +${streak.bonusPercent}%)`, mission.id);
  }
  const lines = [
    fr ? `🎁 **+${mission.reward_points} points** pour : ${mission.title}` : `🎁 **+${mission.reward_points} points** for: ${mission.title}`,
    fr ? `🔥 Série : **${streak.streak} jour${streak.streak > 1 ? 's' : ''}**` : `🔥 Streak: **${streak.streak} day${streak.streak > 1 ? 's' : ''}**`,
  ];
  if (streak.bonusPulse > 0) lines.push(fr ? `💎 Bonus de série : **+${streak.bonusPulse} PULSE** (+${streak.bonusPercent}%)` : `💎 Streak bonus: **+${streak.bonusPulse} PULSE** (+${streak.bonusPercent}%)`);
  return { embeds: [successEmbed(lines.join('\n'))], components: navRows() };
}

// ---- Response helper (ephemeral update-or-reply) ----
async function respond(interaction: Interaction, payload: { embeds: ReturnType<typeof pulseEmbed>[]; components: Row[] }): Promise<void> {
  if (!interaction.isRepliable()) return;
  // If this button is on our own ephemeral message → update it in place.
  // Otherwise (from a pinned public "accueil" embed) → reply ephemerally.
  const isEphemeral = interaction.isMessageComponent() && interaction.message.flags?.has(MessageFlags.Ephemeral);
  if (isEphemeral && interaction.isMessageComponent()) {
    await interaction.update(payload).catch(err => log('ERROR', 'hub update failed', err));
  } else if (interaction.isMessageComponent()) {
    await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(err => log('ERROR', 'hub reply failed', err));
  } else if (interaction.isChatInputCommand()) {
    await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(err => log('ERROR', 'hub cmd reply failed', err));
  }
}

// ---- Slash command entry ----
export const data = new SlashCommandBuilder()
  .setName('hub')
  .setDescription('Ouvre ton hub Novarys / Open your Novarys hub');

export async function execute(interaction: ChatInputCommandInteraction) {
  const payload = await renderHome(interaction, interaction.user.id);
  await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

// ---- Game runners map (single-player bet games launchable from a button/modal) ----
type GameRunner = (interaction: Interaction, bet: number) => Promise<void>;
const GAMES: Record<string, { runner: GameRunner; label: string; emoji: string; defaultBet: number }> = {
  slots:       { runner: (i, b) => runSlots(i as any, b),       label: 'Slots',      emoji: '🎰', defaultBet: 25 },
  blackjack:   { runner: (i, b) => runBlackjack(i as any, b),   label: 'Blackjack',  emoji: '🃏', defaultBet: 25 },
  crash:       { runner: (i, b) => runCrash(i as any, b),       label: 'Crash',      emoji: '💥', defaultBet: 25 },
  wheel:       { runner: (i, b) => runWheel(i as any, b),       label: 'Wheel',      emoji: '🎡', defaultBet: 25 },
  higherlower: { runner: (i, b) => runHigherLower(i as any, b), label: 'Higher/Lower', emoji: '🎲', defaultBet: 25 },
};

function betModal(gameKey: string, defaultBet: number, fr: boolean): ModalBuilder {
  const g = GAMES[gameKey];
  return new ModalBuilder()
    .setCustomId(`hub:playmodal:${gameKey}`)
    .setTitle(`${g?.emoji ?? '🎮'} ${g?.label ?? gameKey} — ${fr ? 'Ta mise' : 'Your bet'}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('bet')
          .setLabel(fr ? 'Mise en PULSE' : 'Bet in PULSE')
          .setStyle(TextInputStyle.Short)
          .setValue(String(defaultBet))
          .setRequired(true),
      ),
    );
}

// ---- Global button router (called by interactionCreate for hub:*) ----
export async function handleHubInteraction(interaction: Interaction): Promise<void> {
  // Modal submissions for game bets
  if (interaction.isModalSubmit() && interaction.customId.startsWith('hub:playmodal:')) {
    const gameKey = interaction.customId.split(':')[2];
    const g = GAMES[gameKey];
    if (!g) return;
    const raw = interaction.fields.getTextInputValue('bet');
    const bet = Math.floor(Number(raw));
    if (!Number.isFinite(bet) || bet <= 0) {
      await interaction.reply({ embeds: [errorEmbed(isFR(interaction) ? 'Mise invalide.' : 'Invalid bet.')], flags: MessageFlags.Ephemeral });
      return;
    }
    try {
      await g.runner(interaction, bet);
    } catch (err) {
      log('ERROR', `Hub playmodal ${gameKey} failed`, err);
    }
    return;
  }

  if (!interaction.isButton()) return;
  const id = interaction.customId;
  const uid = interaction.user.id;

  try {
    // Quick-play: open bet modal
    if (id.startsWith('hub:play:')) {
      const gameKey = id.split(':')[2];
      const g = GAMES[gameKey];
      if (!g) return;
      await interaction.showModal(betModal(gameKey, g.defaultBet, isFR(interaction)));
      return;
    }

    // Rejouer with same bet
    if (id.startsWith('hub:again:')) {
      const parts = id.split(':');
      const gameKey = parts[2];
      const bet = Number(parts[3]);
      const g = GAMES[gameKey];
      if (!g || !Number.isFinite(bet)) return;
      await g.runner(interaction, bet);
      return;
    }

    // Doubler: same game, bet*2
    if (id.startsWith('hub:double:')) {
      const parts = id.split(':');
      const gameKey = parts[2];
      const bet = Number(parts[3]) * 2;
      const g = GAMES[gameKey];
      if (!g || !Number.isFinite(bet)) return;
      await g.runner(interaction, bet);
      return;
    }

    if (id === 'hub:home')    return respond(interaction, await renderHome(interaction, uid));
    if (id === 'hub:profil')  return respond(interaction, await renderProfil(interaction, uid));
    if (id === 'hub:jeux')    return respond(interaction, await renderJeux(interaction));
    if (id === 'hub:missions')return respond(interaction, await renderMissions(interaction));
    if (id === 'hub:shop')    return respond(interaction, await renderShop(interaction));
    if (id === 'hub:lottery') return respond(interaction, await renderLottery(interaction, uid));
    if (id === 'hub:leaderboard') return respond(interaction, await renderLeaderboard(interaction));
    if (id === 'hub:daily')   return respond(interaction, await claimDaily(interaction, uid));

    if (id.startsWith('hub:lb:')) {
      const kind = id.split(':')[2] as 'week' | 'month' | 'total';
      return respond(interaction, await renderLeaderboard(interaction, kind));
    }
    if (id.startsWith('hub:lotto:')) {
      const count = Number(id.split(':')[2]);
      const res = await buyTickets(uid, count);
      const fr = isFR(interaction);
      if (!res.success) {
        return respond(interaction, {
          embeds: [errorEmbed(fr ? `Achat impossible : ${res.error ?? 'erreur'}` : `Purchase failed: ${res.error ?? 'error'}`)],
          components: navRows(),
        });
      }
      void recordChallengeMetric(interaction.client, uid, interaction.user.username, 'lottery_tickets', count);
      return respond(interaction, await renderLottery(interaction, uid));
    }
  } catch (err) {
    log('ERROR', 'Hub interaction handler crashed', err);
  }
}
