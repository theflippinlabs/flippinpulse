import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Interaction,
  MessageActionRowComponentBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { pulseEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';
import {
  buyPremium,
  claimPending,
  getActiveSeason,
  getProgress,
  getTiers,
  tierFromXP,
  type Season,
  type Tier,
  type Progress,
} from '../services/battlePass.js';

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

export const data = new SlashCommandBuilder()
  .setName('battlepass')
  .setDescription('Season pass — earn XP, claim rewards / Pass saisonnier — gagne de l\'XP, réclame')
  .addSubcommand(s => s.setName('view').setDescription('View your progress / Voir ta progression'))
  .addSubcommand(s => s.setName('tiers').setDescription('See all 30 tiers / Voir les 30 paliers'))
  .addSubcommand(s => s.setName('claim').setDescription('Claim pending rewards / Réclamer les récompenses en attente'))
  .addSubcommand(s => s.setName('premium').setDescription('Buy the premium track / Acheter la piste premium'));

const BAR_WIDTH = 14;
function progressBar(current: number, target: number): string {
  const pct = Math.max(0, Math.min(1, target > 0 ? current / target : 0));
  const filled = Math.round(pct * BAR_WIDTH);
  return `\`${'▓'.repeat(filled)}${'░'.repeat(BAR_WIDTH - filled)}\``;
}

function endsInLabel(iso: string, fr: boolean): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return fr ? 'terminé' : 'ended';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return d > 0 ? `${d}${fr ? 'j' : 'd'} ${h}h` : `${h}h`;
}

function renderView(season: Season, tiers: Tier[], p: Progress, fr: boolean): { embeds: EmbedBuilder[]; components: Row[] } {
  const en = !fr;
  const currentTier = tierFromXP(p.xp, season);
  const xpIntoTier = p.xp % season.xp_per_tier;
  const xpNeeded = season.xp_per_tier;
  const nextTier = tiers.find(t => t.tier_number === currentTier + 1);
  const nextPreview = nextTier
    ? `${fr ? 'Prochain palier' : 'Next tier'} **T${nextTier.tier_number}** — ${nextTier.free_reward_label}${p.is_premium ? ` · **${nextTier.premium_reward_label}**` : ''}`
    : (fr ? '**Tous les paliers atteints !**' : '**All tiers reached!**');

  const pendingFree = tiers.filter(t => t.tier_number <= currentTier && !p.claimed_free.includes(t.tier_number)).length;
  const pendingPrem = p.is_premium ? tiers.filter(t => t.tier_number <= currentTier && !p.claimed_premium.includes(t.tier_number)).length : 0;
  const pendingTotal = pendingFree + pendingPrem;

  const embed = new EmbedBuilder()
    .setColor(season.color)
    .setTitle(`${season.emoji} ${fr ? 'Battle Pass' : 'Battle Pass'} — ${season.name}`)
    .setDescription(
      (fr
        ? `**Palier ${currentTier}** / ${season.tier_count} · ${p.is_premium ? '💎 **PREMIUM**' : '🆓 Gratuit'}\n\n` +
          `${progressBar(xpIntoTier, xpNeeded)} ${xpIntoTier} / ${xpNeeded} XP\n\n` +
          `${nextPreview}\n\n` +
          `⏳ Termine dans **${endsInLabel(season.ends_at, fr)}**\n` +
          (pendingTotal ? `\n🎁 **${pendingTotal}** récompense${pendingTotal === 1 ? '' : 's'} en attente — clique **Réclamer**.` : '')
        : `**Tier ${currentTier}** / ${season.tier_count} · ${p.is_premium ? '💎 **PREMIUM**' : '🆓 Free'}\n\n` +
          `${progressBar(xpIntoTier, xpNeeded)} ${xpIntoTier} / ${xpNeeded} XP\n\n` +
          `${nextPreview}\n\n` +
          `⏳ Ends in **${endsInLabel(season.ends_at, fr)}**\n` +
          (pendingTotal ? `\n🎁 **${pendingTotal}** reward${pendingTotal === 1 ? '' : 's'} pending — hit **Claim**.` : ''))
    )
    .setFooter({ text: fr
      ? `Gagne de l'XP en jouant, en discutant et en réclamant tes daily. Prix premium : ${season.premium_price_pulse} PULSE.`
      : `Earn XP by playing, chatting and claiming dailies. Premium price: ${season.premium_price_pulse} PULSE.` });

  const buttons = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId('bp:claim').setLabel(fr ? 'Réclamer' : 'Claim').setEmoji('🎁').setStyle(pendingTotal ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(pendingTotal === 0),
    new ButtonBuilder().setCustomId('bp:tiers').setLabel(fr ? 'Voir les paliers' : 'View tiers').setEmoji('📜').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bp:premium').setLabel(fr ? `Premium (${season.premium_price_pulse} PULSE)` : `Premium (${season.premium_price_pulse} PULSE)`).setEmoji('💎').setStyle(p.is_premium ? ButtonStyle.Secondary : ButtonStyle.Primary).setDisabled(p.is_premium),
  );
  return { embeds: [embed], components: [buttons] };
}

function renderTiers(season: Season, tiers: Tier[], p: Progress, fr: boolean): { embeds: EmbedBuilder[]; components: Row[] } {
  const currentTier = tierFromXP(p.xp, season);
  const lines = tiers.map(t => {
    const reached = t.tier_number <= currentTier;
    const state = reached ? '✅' : '⬜';
    const freeState = p.claimed_free.includes(t.tier_number) ? '🎁' : (reached ? '📦' : '·');
    const premState = p.is_premium ? (p.claimed_premium.includes(t.tier_number) ? '💎' : (reached ? '💠' : '·')) : '🔒';
    return `${state} **T${String(t.tier_number).padStart(2, '0')}** ${freeState} ${t.free_reward_label}  ·  ${premState} ${t.premium_reward_label}`;
  });
  const embed = new EmbedBuilder()
    .setColor(season.color)
    .setTitle(`${season.emoji} ${fr ? 'Paliers' : 'Tiers'} — ${season.name}`)
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: fr
      ? '📦 = à réclamer · 🎁 = déjà réclamé · 💎 = premium réclamé · 🔒 = premium verrouillé'
      : '📦 = to claim · 🎁 = already claimed · 💎 = premium claimed · 🔒 = premium locked' });
  const back = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId('bp:view').setLabel(fr ? 'Retour' : 'Back').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [back] };
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const fr = locale === 'fr';
  const season = await getActiveSeason();
  if (!season) {
    await interaction.reply({ embeds: [errorEmbed(fr ? 'Aucune saison active.' : 'No active season.')], flags: MessageFlags.Ephemeral });
    return;
  }
  const sub = interaction.options.getSubcommand();
  const [tiers, progress] = await Promise.all([getTiers(season.id), getProgress(interaction.user.id, season.id)]);

  if (sub === 'view') {
    await interaction.reply({ ...renderView(season, tiers, progress, fr), flags: MessageFlags.Ephemeral });
    return;
  }
  if (sub === 'tiers') {
    await interaction.reply({ ...renderTiers(season, tiers, progress, fr), flags: MessageFlags.Ephemeral });
    return;
  }
  if (sub === 'claim') {
    const res = await claimPending(interaction.user.id, interaction.client, interaction.guildId ?? undefined);
    if (res.error) { await interaction.reply({ embeds: [errorEmbed(res.error)], flags: MessageFlags.Ephemeral }); return; }
    if (!res.claimed.length) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Rien à réclamer.' : 'Nothing to claim.')], flags: MessageFlags.Ephemeral }); return; }
    const totalPulse = res.claimed.reduce((a, r) => a + r.pulseAwarded, 0);
    const detail = res.claimed.map(r => `${r.track === 'premium' ? '💎' : '🆓'} **T${r.tier}** — ${r.label}`).join('\n');
    await interaction.reply({
      embeds: [successEmbed((fr
        ? `Récompenses réclamées :\n\n${detail}${totalPulse ? `\n\n💰 Total PULSE crédités : **${totalPulse}**` : ''}`
        : `Rewards claimed:\n\n${detail}${totalPulse ? `\n\n💰 Total PULSE credited: **${totalPulse}**` : ''}`))],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (sub === 'premium') {
    const res = await buyPremium(interaction.user.id);
    if (res.alreadyOwned) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Tu as déjà la piste premium.' : 'You already have premium.')], flags: MessageFlags.Ephemeral }); return; }
    if (!res.ok) { await interaction.reply({ embeds: [errorEmbed(res.error ?? (fr ? 'Achat impossible.' : 'Purchase failed.'))], flags: MessageFlags.Ephemeral }); return; }
    await interaction.reply({ embeds: [successEmbed(fr
      ? `💎 Piste premium débloquée pour la saison **${season.name}** ! Réclame tes récompenses avec \`/battlepass claim\`.`
      : `💎 Premium track unlocked for **${season.name}**! Claim your rewards with \`/battlepass claim\`.`)], flags: MessageFlags.Ephemeral });
    return;
  }
}

export async function handleBattlePassInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('bp:')) return;
  const btn = interaction as ButtonInteraction;
  const locale = await getUserLocale(btn.user.id);
  const fr = locale === 'fr';
  const season = await getActiveSeason();
  if (!season) { await btn.reply({ embeds: [errorEmbed(fr ? 'Aucune saison active.' : 'No active season.')], flags: MessageFlags.Ephemeral }); return; }
  const action = btn.customId.split(':')[1];

  if (action === 'claim') {
    const res = await claimPending(btn.user.id, btn.client, btn.guildId ?? undefined);
    if (!res.claimed.length) {
      await btn.reply({ embeds: [errorEmbed(fr ? 'Rien à réclamer.' : 'Nothing to claim.')], flags: MessageFlags.Ephemeral });
      return;
    }
    const [tiers, progress] = await Promise.all([getTiers(season.id), getProgress(btn.user.id, season.id)]);
    await btn.update(renderView(season, tiers, progress, fr));
    const totalPulse = res.claimed.reduce((a, r) => a + r.pulseAwarded, 0);
    const detail = res.claimed.map(r => `${r.track === 'premium' ? '💎' : '🆓'} T${r.tier} — ${r.label}`).join('\n');
    await btn.followUp({
      embeds: [successEmbed((fr
        ? `🎁 Réclamé :\n${detail}${totalPulse ? `\n💰 +${totalPulse} PULSE` : ''}`
        : `🎁 Claimed:\n${detail}${totalPulse ? `\n💰 +${totalPulse} PULSE` : ''}`))],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === 'tiers') {
    const [tiers, progress] = await Promise.all([getTiers(season.id), getProgress(btn.user.id, season.id)]);
    await btn.update(renderTiers(season, tiers, progress, fr));
    return;
  }

  if (action === 'view') {
    const [tiers, progress] = await Promise.all([getTiers(season.id), getProgress(btn.user.id, season.id)]);
    await btn.update(renderView(season, tiers, progress, fr));
    return;
  }

  if (action === 'premium') {
    const res = await buyPremium(btn.user.id);
    if (res.alreadyOwned) { await btn.reply({ embeds: [errorEmbed(fr ? 'Tu as déjà la piste premium.' : 'You already have premium.')], flags: MessageFlags.Ephemeral }); return; }
    if (!res.ok) { await btn.reply({ embeds: [errorEmbed(res.error ?? (fr ? 'Achat impossible.' : 'Purchase failed.'))], flags: MessageFlags.Ephemeral }); return; }
    const [tiers, progress] = await Promise.all([getTiers(season.id), getProgress(btn.user.id, season.id)]);
    await btn.update(renderView(season, tiers, progress, fr));
    await btn.followUp({
      embeds: [successEmbed(fr
        ? `💎 Piste premium débloquée pour la saison **${season.name}** !`
        : `💎 Premium track unlocked for **${season.name}**!`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
}
