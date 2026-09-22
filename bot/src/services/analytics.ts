import { Client } from 'discord.js';
import { supabase } from '../supabase.js';
import { aiChat, hasAI } from './ai.js';
import { getWelcomeConfig } from './settings.js';
import { log } from '../utils/logger.js';

// The weekly cadence is 7 days from the last successful report. The report
// keys itself on the Monday 00:00 UTC of the current week so multiple ticks
// per day are safe idempotent lookups.
function currentWeekStart(): Date {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const offset = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}

async function gatherWeeklyStats() {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [msgCount, joinsCount, newPets, packs, marriagesCount, huntsSolved, giftsCount, bpProgress, activeSeason] = await Promise.all([
    supabase.from('activity_events').select('*', { count: 'exact', head: true }).eq('type', 'message').gte('created_at', weekAgo),
    supabase.from('discord_users').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
    supabase.from('pets').select('*', { count: 'exact', head: true }).eq('is_active', true).gte('created_at', weekAgo),
    supabase.from('pulse_transactions').select('*', { count: 'exact', head: true }).eq('type', 'SPEND_SHOP').ilike('reason', 'TCG pack%').gte('created_at', weekAgo),
    supabase.from('marriages').select('*', { count: 'exact', head: true }).eq('status', 'active').gte('wedding_date', weekAgo),
    supabase.from('treasure_hunts').select('*', { count: 'exact', head: true }).eq('status', 'solved').gte('solved_at', weekAgo),
    supabase.from('pulse_transactions').select('*', { count: 'exact', head: true }).ilike('reason', 'Gift to%').gte('created_at', weekAgo),
    supabase.from('battle_pass_progress').select('*', { count: 'exact', head: true }),
    supabase.from('battle_pass_seasons').select('name').eq('is_active', true).order('id', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const { data: topMembers } = await supabase.from('discord_users').select('username, points_week').order('points_week', { ascending: false }).limit(3);
  return {
    messages: msgCount.count ?? 0,
    newMembers: joinsCount.count ?? 0,
    newPets: newPets.count ?? 0,
    packsOpened: packs.count ?? 0,
    weddings: marriagesCount.count ?? 0,
    huntsSolved: huntsSolved.count ?? 0,
    giftsCount: giftsCount.count ?? 0,
    bpParticipants: bpProgress.count ?? 0,
    seasonName: (activeSeason.data as { name?: string } | null)?.name ?? '—',
    top3: (topMembers ?? []) as { username: string; points_week: number }[],
  };
}

async function generateReport(): Promise<string> {
  const stats = await gatherWeeklyStats();
  const top3 = stats.top3.map((t, i) => `${['🥇','🥈','🥉'][i]} ${t.username} — ${t.points_week} pts`).join('  ');

  const rawFacts = [
    `Messages: ${stats.messages}`,
    `New members: ${stats.newMembers}`,
    `New pets adopted: ${stats.newPets}`,
    `TCG packs opened: ${stats.packsOpened}`,
    `Weddings: ${stats.weddings}`,
    `Treasure hunts solved: ${stats.huntsSolved}`,
    `PULSE gifts sent: ${stats.giftsCount}`,
    `Battle Pass participants: ${stats.bpParticipants} (season "${stats.seasonName}")`,
    `Top 3 this week: ${top3 || 'none'}`,
  ].join('\n');

  if (!hasAI()) return `📊 **Bilan hebdo Novarys**\n\n${rawFacts}`;

  const system = 'Tu es Novus, community manager IA de Novarys. Rédige un bilan hebdomadaire pour le Lord (l\'administrateur) — français uniquement, ~10-15 lignes courtes. ' +
    'Ton : direct, un poil complice, jamais corporate. Utilise les chiffres bruts mais commente-les (tendance, moral, points chauds). ' +
    'Termine par 2-3 suggestions concrètes pour la semaine prochaine. Émojis autorisés, pas plus de 5 dans tout le bilan. ' +
    'Pas de gras Markdown lourd, garde le format bullet-friendly.';

  const reply = await aiChat(system, `Chiffres bruts de la semaine :\n\n${rawFacts}\n\nRédige le bilan.`, 700);
  return reply?.trim() || `📊 **Bilan hebdo Novarys**\n\n${rawFacts}`;
}

export async function runWeeklyAnalyticsSweep(client: Client): Promise<void> {
  const weekStart = currentWeekStart().toISOString();
  const { data: existing } = await supabase.from('weekly_analytics').select('*').eq('week_starts_at', weekStart).maybeSingle();
  if (existing && (existing as { delivered_to_lord?: boolean }).delivered_to_lord) return;

  let report: string;
  if (existing && (existing as { report_text: string }).report_text) {
    report = (existing as { report_text: string }).report_text;
  } else {
    report = await generateReport();
    await supabase.from('weekly_analytics').upsert({
      week_starts_at: weekStart, report_text: report,
    }, { onConflict: 'week_starts_at' });
  }

  // Deliver via DM to every Lord defined in DASHBOARD_ADMIN_IDS (comma-separated).
  const lordIds = (process.env.DASHBOARD_ADMIN_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  for (const id of lordIds) {
    try {
      const user = await client.users.fetch(id).catch(() => null);
      if (!user) continue;
      await user.send(`📊 **Bilan hebdo Novarys** — semaine du ${new Date(weekStart).toLocaleDateString('fr-FR')}\n\n${report}`).catch(() => null);
    } catch (err) { log('ERROR', `Weekly analytics DM to Lord ${id} failed`, err); }
  }

  // Optionally announce in the welcome channel for transparency.
  const welcomeChannelId = getWelcomeConfig().channel_id;
  if (welcomeChannelId) {
    const ch = await client.channels.fetch(welcomeChannelId).catch(() => null);
    if (ch && ch.isTextBased() && !ch.isDMBased() && ch.isSendable()) {
      // Short public teaser
      await ch.send(`📊 Le bilan hebdo de Novarys est prêt (envoyé au Lord).`).catch(() => null);
    }
  }

  await supabase.from('weekly_analytics').update({ delivered_to_lord: true }).eq('week_starts_at', weekStart);
}
