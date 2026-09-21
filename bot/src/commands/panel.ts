import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ChatInputCommandInteraction,
  GuildTextBasedChannel,
  Interaction,
  MessageActionRowComponentBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from 'discord.js';
import {
  getRawSetting, setSetting,
  getWelcomeConfig, getRankUpConfig, getModConfig, getPulseHourConfig,
  getDailyCapConfig, getStreakConfig, getDecayConfig, getEconomyConfig, getPointsConfig,
} from '../services/settings.js';
import { getAutoQuizConfig, launchQuiz } from '../services/communityQuiz.js';
import { getPulsarConfig, pulsarPostNow } from '../services/pulsar.js';
import { launchFlash, launchRiddle, launchObjective, listActiveChallenges, endAllChallenges } from '../services/challenges.js';
import { grantPulse, revokePulse, setPulse } from '../services/economy.js';
import { listGameConfigs, setGameEnabled, updateGameConfigJson, getGameConfig } from '../services/games.js';
import { memberIsLord, requireLord } from '../services/lord.js';
import { supabase } from '../supabase.js';
import { pulseEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';
import { log } from '../utils/logger.js';
import { getUserLocale } from '../i18n.js';

type Section = 'home' | 'modules' | 'channels' | 'quiz' | 'economy' | 'pulse' | 'shop' | 'pulsar' | 'missions' | 'games';
type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

const SHOP_CATEGORIES = ['role', 'perk', 'ticket', 'cosmetic', 'irl'];

async function isFR(userId: string): Promise<boolean> {
  return (await getUserLocale(userId)) === 'fr';
}

interface Module { labelFR: string; labelEN: string; emoji: string; settingKey: string; field: string; read: () => boolean; }

const MODULES: Record<string, Module> = {
  welcome: { labelFR: 'Messages de bienvenue', labelEN: 'Welcome messages', emoji: '👋', settingKey: 'welcome_config', field: 'enabled', read: () => getWelcomeConfig().enabled },
  rankup: { labelFR: 'Annonces de rang', labelEN: 'Rank-up announcements', emoji: '🚀', settingKey: 'rank_up_config', field: 'enabled', read: () => getRankUpConfig().enabled },
  automod: { labelFR: 'Auto-modération', labelEN: 'Auto-moderation', emoji: '🛡️', settingKey: 'mod_config', field: 'automod_enabled', read: () => getModConfig().automod_enabled },
  pulsehour: { labelFR: 'Pulse Hour', labelEN: 'Pulse Hour', emoji: '⚡', settingKey: 'pulse_hour', field: 'enabled', read: () => getPulseHourConfig().enabled },
  dailycap: { labelFR: 'Plafond quotidien PULSE', labelEN: 'Daily PULSE cap', emoji: '🧢', settingKey: 'daily_cap_config', field: 'enabled', read: () => getDailyCapConfig().enabled },
  streak: { labelFR: 'Bonus de série', labelEN: 'Streak bonus', emoji: '🔥', settingKey: 'streak_config', field: 'enabled', read: () => getStreakConfig().enabled },
  decay: { labelFR: 'Décroissance des points', labelEN: 'Point decay', emoji: '📉', settingKey: 'decay', field: 'enabled', read: () => getDecayConfig().enabled },
};

function moduleLabel(m: Module, fr: boolean): string {
  return fr ? m.labelFR : m.labelEN;
}

async function patch(settingKey: string, fields: Record<string, unknown>): Promise<void> {
  const cur = { ...(getRawSetting(settingKey) ?? {}) } as Record<string, unknown>;
  await setSetting(settingKey, { ...cur, ...fields });
}

function navRow(fr: boolean): Row {
  const select = new StringSelectMenuBuilder()
    .setCustomId('panel:nav')
    .setPlaceholder(fr ? '📂 Aller à une section…' : '📂 Go to a section…')
    .addOptions(
      { label: fr ? 'Accueil' : 'Home', value: 'home', emoji: '🏠' },
      { label: fr ? 'Modules (on/off)' : 'Modules (on/off)', value: 'modules', emoji: '⚙️' },
      { label: fr ? 'Salons' : 'Channels', value: 'channels', emoji: '#️⃣' },
      { label: fr ? 'Quiz auto' : 'Auto-quiz', value: 'quiz', emoji: '🧠' },
      { label: fr ? 'Économie' : 'Economy', value: 'economy', emoji: '💰' },
      { label: fr ? 'Donner / retirer PULSE' : 'Give / remove PULSE', value: 'pulse', emoji: '🎁' },
      { label: fr ? 'Boutique' : 'Shop', value: 'shop', emoji: '🛒' },
      { label: fr ? 'Novus (community manager IA)' : 'Novus (AI Community Manager)', value: 'pulsar', emoji: '🧠' },
      { label: fr ? 'Missions' : 'Missions', value: 'missions', emoji: '🎯' },
      { label: fr ? 'Jeux' : 'Games', value: 'games', emoji: '🎮' },
    );
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select);
}

function render(section: Section, fr: boolean): { embeds: ReturnType<typeof pulseEmbed>[]; components: Row[] } {
  const rows: Row[] = [navRow(fr)];

  if (section === 'modules') {
    const select = new StringSelectMenuBuilder()
      .setCustomId('panel:toggle')
      .setPlaceholder(fr ? '⚙️ Touche une option pour activer/désactiver' : '⚙️ Tap a feature to turn it on/off')
      .addOptions(Object.entries(MODULES).map(([key, m]) => ({
        label: moduleLabel(m, fr), value: key, emoji: m.emoji,
        description: m.read()
          ? (fr ? 'Actuellement ACTIVÉ — touche pour désactiver' : 'Currently ON — tap to turn off')
          : (fr ? 'Actuellement DÉSACTIVÉ — touche pour activer' : 'Currently OFF — tap to turn on'),
      })));
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select));
    const lines = Object.values(MODULES).map(m => `${m.read() ? '✅' : '⛔'} ${m.emoji} ${moduleLabel(m, fr)}`);
    return { embeds: [pulseEmbed(fr ? '⚙️ Modules' : '⚙️ Modules').setDescription(lines.join('\n'))], components: rows };
  }

  if (section === 'channels') {
    const w = getWelcomeConfig().channel_id, r = getRankUpConfig().channel_id;
    const ml = getModConfig().mod_log_channel_id, q = getAutoQuizConfig().channel_id;
    const mk = (id: string, label: string) =>
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ChannelSelectMenuBuilder().setCustomId(id).addChannelTypes(ChannelType.GuildText).setPlaceholder(label));
    rows.push(mk('panel:chan:welcome', fr ? '👋 Salon de bienvenue' : '👋 Welcome channel'));
    rows.push(mk('panel:chan:rankup', fr ? '🚀 Salon des rangs' : '🚀 Rank-up channel'));
    rows.push(mk('panel:chan:modlog', fr ? '🛡️ Salon mod-log' : '🛡️ Mod-log channel'));
    rows.push(mk('panel:chan:autoquiz', fr ? '🧠 Salon du quiz auto' : '🧠 Auto-quiz channel'));
    const notSet = fr ? '*(non défini)*' : '*(not set)*';
    return {
      embeds: [pulseEmbed(fr ? '#️⃣ Salons' : '#️⃣ Channels').setDescription(
        (fr ? `Choisis un salon pour chaque :\n\n` : `Pick a channel for each:\n\n`) +
        (fr ? `👋 Bienvenue : ${w ? `<#${w}>` : notSet}\n` : `👋 Welcome: ${w ? `<#${w}>` : notSet}\n`) +
        (fr ? `🚀 Rang : ${r ? `<#${r}>` : notSet}\n` : `🚀 Rank-up: ${r ? `<#${r}>` : notSet}\n`) +
        (fr ? `🛡️ Mod-log : ${ml ? `<#${ml}>` : notSet}\n` : `🛡️ Mod-log: ${ml ? `<#${ml}>` : notSet}\n`) +
        (fr ? `🧠 Quiz auto : ${q ? `<#${q}>` : notSet}\n\n` : `🧠 Auto-quiz: ${q ? `<#${q}>` : notSet}\n\n`) +
        (fr ? `*Le salon de Novus se règle dans la section **Novus**.*` : `*Novus's channel is set in the **Novus** section.*`)
      )],
      components: rows,
    };
  }

  if (section === 'quiz') {
    const c = getAutoQuizConfig();
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:quiztoggle')
        .setLabel(c.enabled ? (fr ? 'Désactiver' : 'Turn OFF') : (fr ? 'Activer' : 'Turn ON'))
        .setEmoji(c.enabled ? '⛔' : '✅')
        .setStyle(c.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId('panel:quizbonus')
        .setLabel(fr ? `Bonus : ${c.bonus_enabled ? 'ON' : 'OFF'}` : `Bonus: ${c.bonus_enabled ? 'ON' : 'OFF'}`)
        .setEmoji('🌟').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:quiznow').setLabel(fr ? 'Lancer maintenant' : 'Launch now').setEmoji('🧠').setStyle(ButtonStyle.Primary),
    ));
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:quiztimes').setLabel(fr ? 'Régler les heures' : 'Set times').setEmoji('🕐').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:quiztopics').setLabel(fr ? 'Régler les sujets' : 'Set topics').setEmoji('🏷️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:quiznums').setLabel(fr ? 'Régler les chiffres' : 'Set numbers').setEmoji('🔢').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:quizping')
        .setLabel(fr ? `@everyone : ${c.ping_everyone ? 'ON' : 'OFF'}` : `@everyone: ${c.ping_everyone ? 'ON' : 'OFF'}`)
        .setEmoji('📢').setStyle(ButtonStyle.Secondary),
    ));
    const setInChannels = fr ? '*(à régler dans Salons)*' : '*(set in Channels)*';
    return {
      embeds: [pulseEmbed(fr ? '🧠 Quiz auto' : '🧠 Auto-quiz').setDescription(
        (fr
          ? `**État :** ${c.enabled ? 'ACTIVÉ ✅' : 'DÉSACTIVÉ ⛔'} · **Salon :** ${c.channel_id ? `<#${c.channel_id}>` : setInChannels}\n` +
            `**Heures quotidiennes (UTC) :** ${c.daily_times_utc.join(', ')}\n` +
            `**Questions :** ${c.questions_per_round}${c.bonus_enabled ? ' + 1 bonus (×2)' : ''} · **${c.seconds_per_question}s** · **+${c.reward_per_correct}** PULSE\n` +
            `**IA :** ${c.auto_generate ? `ACTIVÉE (${c.language})` : 'DÉSACTIVÉE'} · **Sujets :** ${c.topics.join(', ')}\n` +
            `**Annonce :** ${c.ping_everyone ? `@everyone ${c.announce_lead_minutes} min avant` : 'silencieux'}`
          : `**Status:** ${c.enabled ? 'ON ✅' : 'OFF ⛔'} · **Channel:** ${c.channel_id ? `<#${c.channel_id}>` : setInChannels}\n` +
            `**Daily times (UTC):** ${c.daily_times_utc.join(', ')}\n` +
            `**Questions:** ${c.questions_per_round}${c.bonus_enabled ? ' + 1 bonus (×2)' : ''} · **${c.seconds_per_question}s** · **+${c.reward_per_correct}** PULSE\n` +
            `**AI:** ${c.auto_generate ? `ON (${c.language})` : 'OFF'} · **Topics:** ${c.topics.join(', ')}\n` +
            `**Announce:** ${c.ping_everyone ? `@everyone ${c.announce_lead_minutes} min before` : 'silent'}`)
      )],
      components: rows,
    };
  }

  if (section === 'economy') {
    const e = getEconomyConfig(); const p = getPointsConfig();
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:ecotune').setLabel(fr ? 'Régler l\'économie' : 'Tune economy').setEmoji('🪙').setStyle(ButtonStyle.Primary),
    ));
    return {
      embeds: [pulseEmbed(fr ? '💰 Économie' : '💰 Economy').setDescription(
        (fr
          ? `**PULSE par point :** ${e.pulse_per_point}\n` +
            `**Points — message :** ${p.message} · **réaction :** ${p.reaction} · **voix/min :** ${p.voice_per_minute}\n\n` +
            `*Utilise les sections **Donner / retirer PULSE** et **Boutique** pour gérer membres et objets.*`
          : `**PULSE per point:** ${e.pulse_per_point}\n` +
            `**Points — message:** ${p.message} · **reaction:** ${p.reaction} · **voice/min:** ${p.voice_per_minute}\n\n` +
            `*Use the **Give / remove PULSE** and **Shop** sections to manage members & items.*`)
      )],
      components: rows,
    };
  }

  if (section === 'pulsar') {
    const c = getPulsarConfig();
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('panel:chan:pulsar').addChannelTypes(ChannelType.GuildText).setPlaceholder(fr ? '🧠 Salon Novus' : '🧠 Novus channel')));
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:pulsartoggle')
        .setLabel(c.enabled ? (fr ? 'Désactiver' : 'Turn OFF') : (fr ? 'Activer' : 'Turn ON'))
        .setEmoji(c.enabled ? '⛔' : '✅')
        .setStyle(c.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId('panel:pulsartag')
        .setLabel(fr ? `Tag membres : ${c.tag_active_members ? 'ON' : 'OFF'}` : `Tag members: ${c.tag_active_members ? 'ON' : 'OFF'}`)
        .setEmoji('🏷️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:pulsarreply')
        .setLabel(fr ? `Réponses : ${c.reply_to_mentions ? 'ON' : 'OFF'}` : `Replies: ${c.reply_to_mentions ? 'ON' : 'OFF'}`)
        .setEmoji('💬').setStyle(ButtonStyle.Secondary),
    ));
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:pulsarwelcome')
        .setLabel(fr ? `Bienvenues : ${c.welcome ? 'ON' : 'OFF'}` : `Welcomes: ${c.welcome ? 'ON' : 'OFF'}`)
        .setEmoji('👋').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:pulsarevents')
        .setLabel(fr ? `Animer événements : ${c.host_events ? 'ON' : 'OFF'}` : `Host events: ${c.host_events ? 'ON' : 'OFF'}`)
        .setEmoji('🎤').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:pulsarrecap')
        .setLabel(fr ? `Récap quotidien : ${c.recap ? 'ON' : 'OFF'}` : `Daily recap: ${c.recap ? 'ON' : 'OFF'}`)
        .setEmoji('📰').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:pulsarcelebrate')
        .setLabel(fr ? `Célébrer : ${c.celebrate ? 'ON' : 'OFF'}` : `Celebrate: ${c.celebrate ? 'ON' : 'OFF'}`)
        .setEmoji('🎉').setStyle(ButtonStyle.Secondary),
    ));
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:pulsartune').setLabel(fr ? 'Paramètres' : 'Settings').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:pulsarnow').setLabel(fr ? 'Publier maintenant' : 'Post now').setEmoji('🤖').setStyle(ButtonStyle.Primary),
    ));
    const pickAbove = fr ? '*(choisis-en un ci-dessus)*' : '*(pick one above)*';
    return {
      embeds: [pulseEmbed('🧠 NOVUS // COMMUNITY').setDescription(
        (fr
          ? `**État :** ${c.enabled ? 'ACTIVÉ ✅' : 'DÉSACTIVÉ ⛔'} · **Salon :** ${c.channel_id ? `<#${c.channel_id}>` : pickAbove}\n` +
            `**Publie pour animer :** environ toutes les **${c.interval_hours}h** — même quand c'est calme, pour relancer la discussion\n` +
            `**Tag les membres :** ${c.tag_active_members ? 'ON' : 'OFF'} · **Répond aux mentions :** ${c.reply_to_mentions ? 'ON' : 'OFF'}\n` +
            `**Bienvenues :** ${c.welcome ? 'ON' : 'OFF'} · **Anime les événements :** ${c.host_events ? 'ON' : 'OFF'} · **Récap (${c.recap_time_utc} UTC) :** ${c.recap ? 'ON' : 'OFF'} · **Célèbre :** ${c.celebrate ? 'ON' : 'OFF'}\n` +
            `**Langue :** ${c.language}\n\n` +
            `${process.env.ANTHROPIC_API_KEY ? 'Novus accueille les nouveaux, anime les événements, célèbre les victoires et garde la communauté active. 🎉' : '⚠️ Définis `ANTHROPIC_API_KEY` sur Railway pour activer Novus.'}`
          : `**Status:** ${c.enabled ? 'ON ✅' : 'OFF ⛔'} · **Channel:** ${c.channel_id ? `<#${c.channel_id}>` : pickAbove}\n` +
            `**Posts to engage:** about every **${c.interval_hours}h** — even when it's quiet, to revive the chat\n` +
            `**Tags members:** ${c.tag_active_members ? 'ON' : 'OFF'} · **Replies when mentioned:** ${c.reply_to_mentions ? 'ON' : 'OFF'}\n` +
            `**Welcomes:** ${c.welcome ? 'ON' : 'OFF'} · **Host events:** ${c.host_events ? 'ON' : 'OFF'} · **Recap (${c.recap_time_utc} UTC):** ${c.recap ? 'ON' : 'OFF'} · **Celebrate:** ${c.celebrate ? 'ON' : 'OFF'}\n` +
            `**Language:** ${c.language}\n\n` +
            `${process.env.ANTHROPIC_API_KEY ? 'Novus welcomes newcomers, hosts events, celebrates wins and keeps the community alive. 🎉' : '⚠️ Set `ANTHROPIC_API_KEY` in Railway to power Novus.'}`)
      )],
      components: rows,
    };
  }

  if (section === 'missions') {
    const ch = getPulsarConfig().channel_id;
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:missionflash').setLabel(fr ? 'Défi flash' : 'Flash challenge').setEmoji('⚡').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('panel:missionriddle').setLabel(fr ? 'Énigme' : 'Riddle').setEmoji('🧩').setStyle(ButtonStyle.Primary),
    ));
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:missiondaily').setLabel(fr ? 'Objectif quotidien' : 'Daily objective').setEmoji('📅').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:missionweekly').setLabel(fr ? 'Objectif hebdo' : 'Weekly objective').setEmoji('🗓️').setStyle(ButtonStyle.Secondary),
    ));
    const c = getPulsarConfig();
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:missionlist').setLabel(fr ? 'Lister les actives' : 'List active').setEmoji('📋').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:missionend').setLabel(fr ? 'Toutes stopper' : 'End all').setEmoji('🛑').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('panel:missionauto')
        .setLabel(fr ? `Auto-lancement : ${c.missions ? 'ON' : 'OFF'}` : `Auto-launch: ${c.missions ? 'ON' : 'OFF'}`)
        .setEmoji('🔁').setStyle(ButtonStyle.Secondary),
    ));
    return {
      embeds: [pulseEmbed(fr ? '🎯 Missions' : '🎯 Missions').setDescription(
        (fr
          ? `Lance une mission maintenant — elle apparaît dans le salon de Novus ${ch ? `(<#${ch}>)` : '*(règle-le d\'abord dans la section Novus)*'}.\n\n` +
            `⚡ **Flash** — les 3 premiers gagnent 50 PULSE (30 min)\n` +
            `🧩 **Énigme** — le premier à résoudre gagne 100 PULSE (nécessite la clé IA)\n` +
            `📅 **Quotidienne** — envoyer 20 messages · 🗓️ **Hebdo** — jouer 5 parties (suivi auto, crédite les PULSE)\n\n` +
            `🔁 **Auto-lancement :** ${c.missions ? `ACTIVÉ — Novus en démarre une environ toutes les ${c.mission_interval_hours}h` : 'DÉSACTIVÉ'} (nécessite Novus ACTIVÉ).`
          : `Launch a mission now — it posts in Novus's channel ${ch ? `(<#${ch}>)` : '*(set one in the Novus section first)*'}.\n\n` +
            `⚡ **Flash** — first 3 to claim win 50 PULSE (30 min)\n` +
            `🧩 **Riddle** — first to solve wins 100 PULSE (needs AI key)\n` +
            `📅 **Daily** — send 20 messages · 🗓️ **Weekly** — play 5 games (auto-tracked, credits PULSE)\n\n` +
            `🔁 **Auto-launch:** ${c.missions ? `ON — Novus starts one about every ${c.mission_interval_hours}h` : 'OFF'} (needs Novus ON).`)
      )],
      components: rows,
    };
  }

  if (section === 'games') return renderGames(fr);
  if (section === 'pulse') return renderPulse(fr);
  if (section === 'shop') return renderShop(fr);

  // home
  const modLines = Object.values(MODULES).map(m => `${m.read() ? '✅' : '⛔'} ${m.emoji}`).join('  ');
  rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId('panel:quiznow').setLabel(fr ? 'Lancer le quiz maintenant' : 'Launch quiz now').setEmoji('🧠').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel:refresh').setLabel(fr ? 'Rafraîchir' : 'Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
  ));
  return {
    embeds: [pulseEmbed(fr ? '🛠️ NOVARYS — Opérations communautaires' : '🛠️ NOVARYS — Community Operations').setDescription(
      (fr
        ? 'Utilise le **menu de sections** ci-dessus pour tout configurer.\n\n' +
          `**Modules :** ${modLines}\n` +
          `**Quiz auto :** ${getAutoQuizConfig().enabled ? 'ACTIVÉ ✅' : 'DÉSACTIVÉ ⛔'} · **Novus :** ${getPulsarConfig().enabled ? 'ACTIVÉ ✅' : 'DÉSACTIVÉ ⛔'}\n\n` +
          '*Sections : Modules · Salons · Quiz auto · Économie · Donner/retirer PULSE · Boutique · Novus · Missions · Jeux.*'
        : 'Use the **section menu** above to configure everything.\n\n' +
          `**Modules:** ${modLines}\n` +
          `**Auto-quiz:** ${getAutoQuizConfig().enabled ? 'ON ✅' : 'OFF ⛔'} · **Novus:** ${getPulsarConfig().enabled ? 'ON ✅' : 'OFF ⛔'}\n\n` +
          '*Sections: Modules · Channels · Auto-quiz · Economy · Give/remove PULSE · Shop · Novus · Missions · Games.*')
    )],
    components: rows,
  };
}

function renderPulse(fr: boolean, selectedUserId?: string): { embeds: ReturnType<typeof pulseEmbed>[]; components: Row[] } {
  const rows: Row[] = [navRow(fr)];
  rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new UserSelectMenuBuilder().setCustomId('panel:pulseuser').setPlaceholder(fr ? '👤 Choisir un membre…' : '👤 Pick a member…').setMinValues(1).setMaxValues(1)));

  if (selectedUserId) {
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`panel:pulse:give:${selectedUserId}`).setLabel(fr ? 'Donner' : 'Give').setEmoji('➕').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`panel:pulse:remove:${selectedUserId}`).setLabel(fr ? 'Retirer' : 'Remove').setEmoji('➖').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`panel:pulse:set:${selectedUserId}`).setLabel(fr ? 'Solde exact' : 'Set exact').setEmoji('🎯').setStyle(ButtonStyle.Secondary),
    ));
  }

  return {
    embeds: [pulseEmbed(fr ? '🎁 Donner / retirer PULSE' : '🎁 Give / remove PULSE').setDescription(
      selectedUserId
        ? (fr
            ? `Sélectionné : <@${selectedUserId}>\n\nChoisis une action ci-dessous — on te demandera un montant.`
            : `Selected: <@${selectedUserId}>\n\nChoose an action below — you'll be asked for an amount.`)
        : (fr
            ? 'Choisis un membre, puis **Donner**, **Retirer** ou **Solde exact**.'
            : 'Pick a member, then choose **Give**, **Remove**, or **Set exact**.')
    )],
    components: rows,
  };
}

// Game keys → display labels for the panel.
const GAME_LABELS: Record<string, string> = {
  crash: '💥 Crash',
  slots: '🎰 Slots',
  blackjack: '🃏 Blackjack',
  roulette: '🎡 Roulette',
  wheel: '🎯 Wheel',
  higherlower: '🔼 Higher or Lower',
  rps: '✊ Rock-Paper-Scissors',
  duel: '⚔️ Duel',
  quiz: '🧠 Quiz',
  treasure_drop: '💰 Treasure drop',
  typing_race: '⌨️ Typing race',
  battle_royale: '🏆 Battle Royale',
  dice_royale: '🎲 Dice Royale',
};

function labelFor(key: string): string {
  return GAME_LABELS[key] ?? key;
}

function renderGames(fr: boolean, selectedKey?: string): { embeds: ReturnType<typeof pulseEmbed>[]; components: Row[] } {
  const rows: Row[] = [navRow(fr)];
  const configs = listGameConfigs();

  const options = configs.slice(0, 25).map(c => ({
    label: labelFor(c.game_key).slice(0, 100),
    value: c.game_key,
    description: (c.is_enabled
      ? (fr ? 'ACTIVÉ — touche pour configurer' : 'ON — tap to configure')
      : (fr ? 'DÉSACTIVÉ — touche pour configurer' : 'OFF — tap to configure')).slice(0, 100),
    emoji: c.is_enabled ? '✅' : '⛔',
    default: c.game_key === selectedKey,
  }));

  rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('panel:gamespick')
      .setPlaceholder(fr ? '🎮 Choisis un jeu à configurer…' : '🎮 Pick a game to configure…')
      .addOptions(options),
  ));

  let description = (fr
    ? 'Active/désactive un jeu, ou édite **mises, cooldown et avantage de la maison (taux de gain)**.\n\n'
    : 'Turn a game **on / off**, or edit its **bets, cooldown, and house edge (win chance)**.\n\n') +
    configs.map(c => `${c.is_enabled ? '✅' : '⛔'} ${labelFor(c.game_key)}`).join('  ·  ');

  if (selectedKey) {
    const cfg = getGameConfig(selectedKey);
    const j = (cfg?.config_json ?? {}) as Record<string, unknown>;
    const fmt = (k: string, fallback: string) => (j[k] === undefined ? fallback : String(j[k]));
    const feePct = fmt('fee_percent', '—');
    description = (fr
      ? `**${labelFor(selectedKey)}** — ${cfg?.is_enabled ? '✅ ACTIVÉ' : '⛔ DÉSACTIVÉ'}\n\n` +
        `**Mise min :** ${fmt('min_bet', '—')} PULSE · **Mise max :** ${fmt('max_bet', '—')} PULSE\n` +
        `**Avantage maison :** ${feePct}%  *(plus élevé = moins de gains pour le joueur)*\n` +
        `**Cooldown :** ${fmt('cooldown_seconds', '—')}s\n\n` +
        `Utilise les boutons pour activer/désactiver ou éditer.`
      : `**${labelFor(selectedKey)}** — ${cfg?.is_enabled ? '✅ ON' : '⛔ OFF'}\n\n` +
        `**Min bet:** ${fmt('min_bet', '—')} PULSE · **Max bet:** ${fmt('max_bet', '—')} PULSE\n` +
        `**House edge:** ${feePct}%  *(higher = lower win chance for the player)*\n` +
        `**Cooldown:** ${fmt('cooldown_seconds', '—')}s\n\n` +
        `Use the buttons to toggle or edit.`);

    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`panel:gametoggle:${selectedKey}`)
        .setLabel(cfg?.is_enabled ? (fr ? 'Désactiver' : 'Turn OFF') : (fr ? 'Activer' : 'Turn ON'))
        .setEmoji(cfg?.is_enabled ? '⛔' : '✅')
        .setStyle(cfg?.is_enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`panel:gameedit:${selectedKey}`)
        .setLabel(fr ? 'Éditer mises & taux' : 'Edit bets & win chance')
        .setEmoji('⚙️')
        .setStyle(ButtonStyle.Primary),
    ));
  }

  return {
    embeds: [pulseEmbed(fr ? '🎮 Jeux' : '🎮 Games').setDescription(description)],
    components: rows,
  };
}

function renderShop(fr: boolean): { embeds: ReturnType<typeof pulseEmbed>[]; components: Row[] } {
  const rows: Row[] = [navRow(fr)];
  rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId('panel:shop:add').setLabel(fr ? 'Ajouter un objet' : 'Add item').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel:shop:list').setLabel(fr ? 'Lister les objets' : 'List items').setEmoji('📋').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel:shop:remove').setLabel(fr ? 'Masquer un objet' : 'Hide item').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
  ));
  rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId('panel:shop:price').setLabel(fr ? 'Régler un prix' : 'Set price').setEmoji('💱').setStyle(ButtonStyle.Secondary),
  ));
  return {
    embeds: [pulseEmbed(fr ? '🛒 Boutique' : '🛒 Shop').setDescription(
      (fr
        ? `Gérer la boutique PULSE :\n\n` +
          `➕ **Ajouter un objet** · 📋 **Lister** · 🗑️ **Masquer** · 💱 **Régler le prix**\n\n` +
          `Catégories : ${SHOP_CATEGORIES.join(', ')}.`
        : `Manage the PULSE shop:\n\n` +
          `➕ **Add item** · 📋 **List** · 🗑️ **Hide** · 💱 **Set price**\n\n` +
          `Categories: ${SHOP_CATEGORIES.join(', ')}.`)
    )],
    components: rows,
  };
}

export const data = new SlashCommandBuilder()
  .setName('panel')
  .setDescription('Admin: open the control panel')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!(await requireLord(interaction))) return;
  const fr = await isFR(interaction.user.id);
  await interaction.reply({ ...render('home', fr), flags: MessageFlags.Ephemeral });
}

export async function handlePanelInteraction(interaction: Interaction): Promise<void> {
  // Gate every panel action on the Lord role.
  if (interaction.isRepliable()) {
    const member = interaction.member && 'guild' in interaction.member ? interaction.member : null;
    if (!memberIsLord(member as never)) {
      if (!interaction.replied) {
        const fr = await isFR(interaction.user.id);
        await interaction.reply({
          embeds: [errorEmbed(fr ? 'Ce panneau est réservé au Lord.' : 'This panel is Lord-only.')],
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      }
      return;
    }
  }

  const fr = await isFR(interaction.user.id);

  // Navigation
  if (interaction.isStringSelectMenu() && interaction.customId === 'panel:nav') {
    await interaction.update(render(interaction.values[0] as Section, fr));
    return;
  }

  // Games section
  if (interaction.isStringSelectMenu() && interaction.customId === 'panel:gamespick') {
    await interaction.update(renderGames(fr, interaction.values[0]));
    return;
  }

  // Module toggle
  if (interaction.isStringSelectMenu() && interaction.customId === 'panel:toggle') {
    const m = MODULES[interaction.values[0]];
    if (m) await patch(m.settingKey, { [m.field]: !m.read() });
    await interaction.update(render('modules', fr));
    return;
  }

  // PULSE member picker
  if (interaction.isUserSelectMenu() && interaction.customId === 'panel:pulseuser') {
    await interaction.update(renderPulse(fr, interaction.values[0]));
    return;
  }

  // Channel pickers
  if (interaction.isChannelSelectMenu() && interaction.customId.startsWith('panel:chan:')) {
    const which = interaction.customId.split(':')[2];
    const id = interaction.values[0];
    if (which === 'welcome') await patch('welcome_config', { channel_id: id });
    else if (which === 'rankup') await patch('rank_up_config', { channel_id: id });
    else if (which === 'modlog') await patch('mod_config', { mod_log_channel_id: id });
    else if (which === 'autoquiz') await patch('auto_quiz', { channel_id: id });
    else if (which === 'pulsar') await patch('pulsar_config', { channel_id: id });
    await interaction.update(render(which === 'pulsar' ? 'pulsar' : 'channels', fr));
    return;
  }

  if (interaction.isButton()) {
    const id = interaction.customId;

    if (id === 'panel:refresh') { await interaction.update(render('home', fr)); return; }

    // Games — toggle enabled
    if (id.startsWith('panel:gametoggle:')) {
      const key = id.slice('panel:gametoggle:'.length);
      const cur = getGameConfig(key);
      if (!cur) { await interaction.reply({ embeds: [errorEmbed(fr ? `Jeu inconnu « ${key} ».` : `Unknown game "${key}".`)], flags: MessageFlags.Ephemeral }); return; }
      try {
        await setGameEnabled(key, !cur.is_enabled);
      } catch {
        await interaction.reply({ embeds: [errorEmbed(fr ? 'Impossible d\'activer/désactiver ce jeu.' : 'Could not toggle that game.')], flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.update(renderGames(fr, key));
      return;
    }

    // Games — edit modal
    if (id.startsWith('panel:gameedit:')) {
      const key = id.slice('panel:gameedit:'.length);
      const cur = getGameConfig(key);
      if (!cur) { await interaction.reply({ embeds: [errorEmbed(fr ? `Jeu inconnu « ${key} ».` : `Unknown game "${key}".`)], flags: MessageFlags.Ephemeral }); return; }
      await interaction.showModal(gameEditModal(key, fr));
      return;
    }

    if (id === 'panel:quiztoggle') { await patch('auto_quiz', { enabled: !getAutoQuizConfig().enabled }); await interaction.update(render('quiz', fr)); return; }
    if (id === 'panel:quizbonus') { await patch('auto_quiz', { bonus_enabled: !getAutoQuizConfig().bonus_enabled }); await interaction.update(render('quiz', fr)); return; }
    if (id === 'panel:quizping') { await patch('auto_quiz', { ping_everyone: !getAutoQuizConfig().ping_everyone }); await interaction.update(render('quiz', fr)); return; }

    if (id === 'panel:quiznow') {
      const channel = interaction.channel;
      if (!channel || !channel.isTextBased() || channel.isDMBased()) {
        await interaction.reply({ embeds: [errorEmbed(fr ? 'Utilise ceci dans un salon texte.' : 'Use this in a text channel.')], flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply({ embeds: [successEmbed(fr ? 'Lancement d\'un quiz ici maintenant ! 🧠 (génération des questions…)' : 'Launching a quiz here now! 🧠 (generating questions…)')], flags: MessageFlags.Ephemeral });
      void launchQuiz(channel as GuildTextBasedChannel, getAutoQuizConfig());
      return;
    }

    if (id === 'panel:quiztimes') { await interaction.showModal(timesModal(fr)); return; }
    if (id === 'panel:quiztopics') { await interaction.showModal(topicsModal(fr)); return; }
    if (id === 'panel:quiznums') { await interaction.showModal(numsModal(fr)); return; }
    if (id === 'panel:ecotune') { await interaction.showModal(ecoModal(fr)); return; }

    // Pulsar
    if (id === 'panel:pulsartoggle') { await patch('pulsar_config', { enabled: !getPulsarConfig().enabled }); await interaction.update(render('pulsar', fr)); return; }
    if (id === 'panel:pulsartag') { await patch('pulsar_config', { tag_active_members: !getPulsarConfig().tag_active_members }); await interaction.update(render('pulsar', fr)); return; }
    if (id === 'panel:pulsarreply') { await patch('pulsar_config', { reply_to_mentions: !getPulsarConfig().reply_to_mentions }); await interaction.update(render('pulsar', fr)); return; }
    if (id === 'panel:pulsarwelcome') { await patch('pulsar_config', { welcome: !getPulsarConfig().welcome }); await interaction.update(render('pulsar', fr)); return; }
    if (id === 'panel:pulsarevents') { await patch('pulsar_config', { host_events: !getPulsarConfig().host_events }); await interaction.update(render('pulsar', fr)); return; }
    if (id === 'panel:pulsarrecap') { await patch('pulsar_config', { recap: !getPulsarConfig().recap }); await interaction.update(render('pulsar', fr)); return; }
    if (id === 'panel:pulsarcelebrate') { await patch('pulsar_config', { celebrate: !getPulsarConfig().celebrate }); await interaction.update(render('pulsar', fr)); return; }
    if (id === 'panel:pulsartune') { await interaction.showModal(pulsarModal(fr)); return; }
    if (id === 'panel:pulsarnow') {
      const cfg = getPulsarConfig();
      if (!cfg.channel_id) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Choisis d\'abord un salon Novus.' : 'Pick a Novus channel first.')], flags: MessageFlags.Ephemeral }); return; }
      if (!process.env.ANTHROPIC_API_KEY) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Définis `ANTHROPIC_API_KEY` sur Railway pour activer Novus.' : 'Set `ANTHROPIC_API_KEY` in Railway to power Novus.')], flags: MessageFlags.Ephemeral }); return; }
      if (!interaction.guild) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Utilise ceci sur un serveur.' : 'Use this in a server.')], flags: MessageFlags.Ephemeral }); return; }
      await interaction.reply({ embeds: [successEmbed(fr ? 'Novus publie maintenant. 🧠' : 'Novus is posting now. 🧠')], flags: MessageFlags.Ephemeral });
      void pulsarPostNow(interaction.client, interaction.guild.id);
      return;
    }

    // Missions
    if (id.startsWith('panel:mission')) {
      const ch = getPulsarConfig().channel_id;
      if (id === 'panel:missionlist') {
        const active = await listActiveChallenges();
        const desc = active.length
          ? active.map(m => `• **${m.title}** (${m.kind})${m.goal ? ` — ${fr ? 'but' : 'goal'} ${m.goal}` : ''} · ${m.reward} PULSE`).join('\n')
          : (fr ? 'Aucune mission active pour l\'instant.' : 'No active missions right now.');
        await interaction.reply({ embeds: [pulseEmbed(fr ? '🎯 Missions actives' : '🎯 Active missions').setDescription(desc.slice(0, 4000))], flags: MessageFlags.Ephemeral });
        return;
      }
      if (id === 'panel:missionend') {
        const n = await endAllChallenges(interaction.client);
        await interaction.reply({ embeds: [successEmbed(fr
          ? `**${n}** mission${n === 1 ? '' : 's'} active${n === 1 ? '' : 's'} arrêtée${n === 1 ? '' : 's'}.`
          : `Ended **${n}** active mission${n === 1 ? '' : 's'}.`)], flags: MessageFlags.Ephemeral });
        return;
      }
      if (id === 'panel:missionauto') { await patch('pulsar_config', { missions: !getPulsarConfig().missions }); await interaction.update(render('missions', fr)); return; }
      if (!ch) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Définis d\'abord un salon Novus (section Novus).' : 'Set a Novus channel first (Novus section).')], flags: MessageFlags.Ephemeral }); return; }
      await interaction.reply({ embeds: [successEmbed(fr ? 'Lancement de la mission maintenant ! 🎯' : 'Launching the mission now! 🎯')], flags: MessageFlags.Ephemeral });
      if (id === 'panel:missionflash') void launchFlash(interaction.client, ch, { reward: 50, maxWinners: 3, durationMin: 30 });
      else if (id === 'panel:missionriddle') void launchRiddle(interaction.client, ch, { reward: 100, durationMin: 60 });
      else if (id === 'panel:missiondaily') void launchObjective(interaction.client, ch, { kind: 'daily', metric: 'messages', goal: 20, reward: 60 });
      else if (id === 'panel:missionweekly') void launchObjective(interaction.client, ch, { kind: 'weekly', metric: 'games_played', goal: 5, reward: 250 });
      return;
    }

    // PULSE actions: panel:pulse:<action>:<userId>
    if (id.startsWith('panel:pulse:')) {
      const [, , action, userId] = id.split(':');
      await interaction.showModal(pulseModal(action, userId, fr));
      return;
    }

    // Shop actions
    if (id === 'panel:shop:add') { await interaction.showModal(shopAddModal(fr)); return; }
    if (id === 'panel:shop:remove') { await interaction.showModal(shopNameModal('remove', fr ? 'Masquer un objet' : 'Hide a shop item', fr)); return; }
    if (id === 'panel:shop:price') { await interaction.showModal(shopPriceModal(fr)); return; }
    if (id === 'panel:shop:list') {
      const { data: items } = await supabase
        .from('shop_items')
        .select('name, price_pulse, category, is_active, stock_remaining')
        .order('price_pulse', { ascending: true })
        .limit(40);
      const desc = !items?.length
        ? (fr ? 'Aucun objet pour l\'instant. Utilise **Ajouter un objet**.' : 'No items yet. Use **Add item**.')
        : items.map(i => {
            const stock = i.stock_remaining !== null ? ` · ${i.stock_remaining} ${fr ? 'restants' : 'left'}` : '';
            return `${i.is_active ? '🟢' : '⚫'} **${i.name}** — ${i.price_pulse} PULSE · ${i.category}${stock}`;
          }).join('\n');
      await interaction.reply({ embeds: [pulseEmbed(fr ? '🛒 Objets de la boutique' : '🛒 Shop items').setDescription(desc.slice(0, 4000))], flags: MessageFlags.Ephemeral });
      return;
    }
    return;
  }

  // Modal submissions
  if (interaction.isModalSubmit()) {
    const id = interaction.customId;
    try {
      if (id === 'panel:modal:times') {
        const times = interaction.fields.getTextInputValue('v').split(',').map(t => t.trim()).filter(t => /^\d{1,2}:\d{2}$/.test(t));
        if (!times.length) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Utilise des heures UTC comme 18:00,00:00' : 'Use UTC times like 18:00,00:00')], flags: MessageFlags.Ephemeral }); return; }
        await patch('auto_quiz', { daily_times_utc: times });
        await setSetting('auto_quiz_state', { fired: {} });
        await interaction.reply({ embeds: [successEmbed(fr
          ? `Heures quotidiennes du quiz : **${times.join(', ')} UTC**.`
          : `Daily quiz times: **${times.join(', ')} UTC**.`)], flags: MessageFlags.Ephemeral });
        return;
      }
      if (id === 'panel:modal:topics') {
        const topics = interaction.fields.getTextInputValue('v').split(',').map(t => t.trim()).filter(Boolean);
        if (!topics.length) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Donne au moins un sujet.' : 'Give at least one topic.')], flags: MessageFlags.Ephemeral }); return; }
        await patch('auto_quiz', { topics });
        await interaction.reply({ embeds: [successEmbed(fr ? `Sujets du quiz : ${topics.join(', ')}.` : `Quiz topics: ${topics.join(', ')}.`)], flags: MessageFlags.Ephemeral });
        return;
      }
      if (id === 'panel:modal:nums') {
        const num = (k: string, fallback: number) => { const n = Number(interaction.fields.getTextInputValue(k)); return Number.isFinite(n) && n >= 0 ? n : fallback; };
        const c = getAutoQuizConfig();
        await patch('auto_quiz', {
          questions_per_round: Math.max(1, Math.min(15, num('q', c.questions_per_round))),
          seconds_per_question: Math.max(5, Math.min(120, num('s', c.seconds_per_question))),
          reward_per_correct: num('r', c.reward_per_correct),
          language: interaction.fields.getTextInputValue('l').trim() || c.language,
        });
        await interaction.reply({ embeds: [successEmbed(fr ? 'Chiffres du quiz mis à jour.' : 'Quiz numbers updated.')], flags: MessageFlags.Ephemeral });
        return;
      }
      if (id === 'panel:modal:eco') {
        const num = (k: string, fallback: number) => { const n = Number(interaction.fields.getTextInputValue(k)); return Number.isFinite(n) && n >= 0 ? n : fallback; };
        const e = getEconomyConfig(); const p = getPointsConfig();
        await patch('economy', { pulse_per_point: num('ppp', e.pulse_per_point) });
        await patch('points_config', { message: num('m', p.message), reaction: num('re', p.reaction), voice_per_minute: num('v', p.voice_per_minute) });
        await interaction.reply({ embeds: [successEmbed(fr ? 'Économie mise à jour.' : 'Economy updated.')], flags: MessageFlags.Ephemeral });
        return;
      }
      if (id === 'panel:modal:pulsar') {
        const c = getPulsarConfig();
        const hrs = Number(interaction.fields.getTextInputValue('h'));
        const recapTime = interaction.fields.getTextInputValue('r').trim();
        await patch('pulsar_config', {
          interval_hours: Number.isFinite(hrs) && hrs >= 0.5 ? Math.min(24, hrs) : c.interval_hours,
          language: interaction.fields.getTextInputValue('l').trim() || c.language,
          recap_time_utc: /^\d{1,2}:\d{2}$/.test(recapTime) ? recapTime : c.recap_time_utc,
        });
        await interaction.reply({ embeds: [successEmbed(fr ? 'Paramètres Novus mis à jour.' : 'Novus settings updated.')], flags: MessageFlags.Ephemeral });
        return;
      }

      // PULSE give/remove/set: panel:modal:pulse:<action>:<userId>
      if (id.startsWith('panel:modal:pulse:')) {
        const [, , , action, userId] = id.split(':');
        const amount = Number(interaction.fields.getTextInputValue('amt'));
        const reason = (interaction.fields.getTextInputValue('reason') || (fr ? 'Panneau admin' : 'Admin panel')).trim();
        if (!Number.isFinite(amount) || amount < (action === 'set' ? 0 : 1)) {
          await interaction.reply({ embeds: [errorEmbed(fr ? 'Entre un montant valide.' : 'Enter a valid amount.')], flags: MessageFlags.Ephemeral });
          return;
        }
        const user = await interaction.client.users.fetch(userId).catch(() => null);
        if (!user || user.bot) {
          await interaction.reply({ embeds: [errorEmbed(fr ? 'Membre introuvable.' : 'That member could not be found.')], flags: MessageFlags.Ephemeral });
          return;
        }
        const res = action === 'give'
          ? await grantPulse(user.id, user.username, user.displayAvatarURL(), amount, reason, interaction.user.id)
          : action === 'remove'
            ? await revokePulse(user.id, amount, reason, interaction.user.id)
            : await setPulse(user.id, user.username, user.displayAvatarURL(), amount, reason, interaction.user.id);
        if (!res.success) {
          await interaction.reply({ embeds: [errorEmbed(res.error ?? (fr ? 'Échec.' : 'Failed.'))], flags: MessageFlags.Ephemeral });
          return;
        }
        const verb = fr
          ? (action === 'give' ? 'Donné' : action === 'remove' ? 'Retiré' : 'Solde défini pour')
          : (action === 'give' ? 'Gave' : action === 'remove' ? 'Removed' : 'Set balance for');
        await interaction.reply({ embeds: [successEmbed(fr
          ? `${verb} **${amount}** PULSE — <@${user.id}> a maintenant **${res.newBalance}** PULSE.`
          : `${verb} **${amount}** PULSE — <@${user.id}> now has **${res.newBalance}** PULSE.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      if (id === 'panel:modal:shopadd') {
        const name = interaction.fields.getTextInputValue('name').trim();
        const price = Number(interaction.fields.getTextInputValue('price'));
        let category = (interaction.fields.getTextInputValue('category') || 'perk').toLowerCase().trim();
        if (!SHOP_CATEGORIES.includes(category)) category = 'perk';
        const description = interaction.fields.getTextInputValue('description').trim();
        const stockRaw = interaction.fields.getTextInputValue('stock').trim();
        const stock = stockRaw ? Math.max(1, Math.floor(Number(stockRaw))) : null;
        if (!name || !Number.isFinite(price) || price < 0) {
          await interaction.reply({ embeds: [errorEmbed(fr ? 'Entre un nom et un prix valide.' : 'Enter a name and a valid price.')], flags: MessageFlags.Ephemeral });
          return;
        }
        const { error } = await supabase.from('shop_items').insert({
          name, description, category, price_pulse: Math.floor(price),
          stock_total: stock, stock_remaining: stock, max_per_user: 1, is_active: true,
        });
        if (error) { await interaction.reply({ embeds: [errorEmbed(fr ? `Impossible d'ajouter l'objet : ${error.message}` : `Could not add item: ${error.message}`)], flags: MessageFlags.Ephemeral }); return; }
        await interaction.reply({ embeds: [successEmbed(fr
          ? `Ajouté **${name}** — ${Math.floor(price)} PULSE (${category})${stock ? `, stock ${stock}` : ''}.`
          : `Added **${name}** — ${Math.floor(price)} PULSE (${category})${stock ? `, stock ${stock}` : ''}.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      if (id.startsWith('panel:modal:gameedit:')) {
        const key = id.slice('panel:modal:gameedit:'.length);
        const cur = getGameConfig(key);
        if (!cur) { await interaction.reply({ embeds: [errorEmbed(fr ? `Jeu inconnu « ${key} ».` : `Unknown game "${key}".`)], flags: MessageFlags.Ephemeral }); return; }
        const j = (cur.config_json ?? {}) as Record<string, unknown>;
        const num = (cid: string, fallback: number, min: number, max: number): number => {
          const raw = interaction.fields.getTextInputValue(cid).trim();
          if (!raw) return fallback;
          const n = Number(raw);
          if (!Number.isFinite(n)) return fallback;
          return Math.min(max, Math.max(min, n));
        };
        const patchJson: Record<string, unknown> = {
          min_bet: num('min', (j.min_bet as number) ?? 0, 0, 1_000_000),
          max_bet: num('max', (j.max_bet as number) ?? 0, 0, 10_000_000),
          fee_percent: num('fee', (j.fee_percent as number) ?? 0, 0, 100),
          cooldown_seconds: num('cd', (j.cooldown_seconds as number) ?? 0, 0, 86_400),
        };
        try {
          await updateGameConfigJson(key, patchJson);
        } catch {
          await interaction.reply({ embeds: [errorEmbed(fr ? `Impossible de sauvegarder ${key}.` : `Failed to save ${key}.`)], flags: MessageFlags.Ephemeral });
          return;
        }
        await interaction.reply({
          embeds: [successEmbed(fr
            ? `**${labelFor(key)}** mis à jour — min ${patchJson.min_bet}, max ${patchJson.max_bet}, avantage maison ${patchJson.fee_percent}%, cooldown ${patchJson.cooldown_seconds}s.`
            : `**${labelFor(key)}** updated — min ${patchJson.min_bet}, max ${patchJson.max_bet}, house edge ${patchJson.fee_percent}%, cooldown ${patchJson.cooldown_seconds}s.`)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (id === 'panel:modal:shopremove' || id === 'panel:modal:shopprice') {
        const name = interaction.fields.getTextInputValue('name').trim();
        const { data: item } = await supabase.from('shop_items').select('id, name').ilike('name', name).limit(1).maybeSingle();
        if (!item) { await interaction.reply({ embeds: [errorEmbed(fr
          ? `Aucun objet nommé « ${name} ». Utilise **Lister les objets** pour vérifier.`
          : `No item named "${name}". Use **List items** to check.`)], flags: MessageFlags.Ephemeral }); return; }
        if (id === 'panel:modal:shopremove') {
          await supabase.from('shop_items').update({ is_active: false }).eq('id', item.id);
          await interaction.reply({ embeds: [successEmbed(fr
            ? `**${item.name}** est maintenant masqué de la boutique.`
            : `**${item.name}** is now hidden from the shop.`)], flags: MessageFlags.Ephemeral });
        } else {
          const price = Number(interaction.fields.getTextInputValue('price'));
          if (!Number.isFinite(price) || price < 0) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Entre un prix valide.' : 'Enter a valid price.')], flags: MessageFlags.Ephemeral }); return; }
          await supabase.from('shop_items').update({ price_pulse: Math.floor(price) }).eq('id', item.id);
          await interaction.reply({ embeds: [successEmbed(fr
            ? `Prix de **${item.name}** défini à **${Math.floor(price)}** PULSE.`
            : `**${item.name}** price set to **${Math.floor(price)}** PULSE.`)], flags: MessageFlags.Ephemeral });
        }
        return;
      }
    } catch (err) {
      log('ERROR', 'Panel modal failed', err);
      if (!interaction.replied) await interaction.reply({ embeds: [errorEmbed(fr ? 'Impossible de sauvegarder.' : 'Failed to save.')], flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

function oneField(modalId: string, title: string, label: string, value: string, style = TextInputStyle.Short): ModalBuilder {
  return new ModalBuilder().setCustomId(modalId).setTitle(title).addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('v').setLabel(label).setStyle(style).setValue(value).setRequired(true)));
}

function timesModal(fr: boolean): ModalBuilder {
  return oneField(
    'panel:modal:times',
    fr ? 'Heures du quiz quotidien (UTC)' : 'Daily quiz times (UTC)',
    fr ? 'Séparées par des virgules, ex. 18:00,00:00' : 'Comma-separated, e.g. 18:00,00:00',
    getAutoQuizConfig().daily_times_utc.join(', '),
  );
}
function topicsModal(fr: boolean): ModalBuilder {
  return oneField(
    'panel:modal:topics',
    fr ? 'Sujets du quiz IA' : 'AI quiz topics',
    fr ? 'Sujets séparés par des virgules' : 'Comma-separated topics',
    getAutoQuizConfig().topics.join(', '),
    TextInputStyle.Paragraph,
  );
}
function numsModal(fr: boolean): ModalBuilder {
  const c = getAutoQuizConfig();
  const f = (cid: string, label: string, val: string) =>
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId(cid).setLabel(label).setStyle(TextInputStyle.Short).setValue(val).setRequired(true));
  return new ModalBuilder().setCustomId('panel:modal:nums').setTitle(fr ? 'Chiffres du quiz' : 'Quiz numbers').addComponents(
    f('q', fr ? 'Questions par tour (1-15)' : 'Questions per round (1-15)', String(c.questions_per_round)),
    f('s', fr ? 'Secondes par question (5-120)' : 'Seconds per question (5-120)', String(c.seconds_per_question)),
    f('r', fr ? 'PULSE par bonne réponse' : 'PULSE per correct answer', String(c.reward_per_correct)),
    f('l', fr ? 'Langue (ex. English, French)' : 'Language (e.g. English, French)', c.language));
}
function ecoModal(fr: boolean): ModalBuilder {
  const e = getEconomyConfig(); const p = getPointsConfig();
  const f = (cid: string, label: string, val: string) =>
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId(cid).setLabel(label).setStyle(TextInputStyle.Short).setValue(val).setRequired(true));
  return new ModalBuilder().setCustomId('panel:modal:eco').setTitle(fr ? 'Paramètres économie' : 'Economy settings').addComponents(
    f('ppp', fr ? 'PULSE par point d\'activité' : 'PULSE per activity point', String(e.pulse_per_point)),
    f('m', fr ? 'Points par message' : 'Points per message', String(p.message)),
    f('re', fr ? 'Points par réaction' : 'Points per reaction', String(p.reaction)),
    f('v', fr ? 'Points par minute vocale' : 'Points per voice minute', String(p.voice_per_minute)));
}

function pulseModal(action: string, userId: string, fr: boolean): ModalBuilder {
  const title = fr
    ? (action === 'give' ? 'Donner du PULSE' : action === 'remove' ? 'Retirer du PULSE' : 'Définir le solde PULSE')
    : (action === 'give' ? 'Give PULSE' : action === 'remove' ? 'Remove PULSE' : 'Set PULSE balance');
  return new ModalBuilder().setCustomId(`panel:modal:pulse:${action}:${userId}`).setTitle(title).addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('amt')
        .setLabel(fr
          ? (action === 'set' ? 'Solde exact' : 'Montant')
          : (action === 'set' ? 'Exact balance' : 'Amount'))
        .setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('reason').setLabel(fr ? 'Raison (optionnel)' : 'Reason (optional)').setStyle(TextInputStyle.Short).setRequired(false)));
}

function shopAddModal(fr: boolean): ModalBuilder {
  const f = (cid: string, label: string, required: boolean, style = TextInputStyle.Short) =>
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId(cid).setLabel(label).setStyle(style).setRequired(required));
  return new ModalBuilder().setCustomId('panel:modal:shopadd').setTitle(fr ? 'Ajouter un objet' : 'Add shop item').addComponents(
    f('name', fr ? 'Nom de l\'objet' : 'Item name', true),
    f('price', fr ? 'Prix en PULSE' : 'Price in PULSE', true),
    f('category', fr ? `Catégorie (${SHOP_CATEGORIES.join('/')})` : `Category (${SHOP_CATEGORIES.join('/')})`, false),
    f('description', fr ? 'Description (optionnel)' : 'Description (optional)', false, TextInputStyle.Paragraph),
    f('stock', fr ? 'Stock (vide = illimité)' : 'Stock (blank = unlimited)', false));
}

function shopNameModal(kind: string, title: string, fr: boolean): ModalBuilder {
  return new ModalBuilder().setCustomId(`panel:modal:shop${kind}`).setTitle(title).addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('name').setLabel(fr ? 'Nom de l\'objet' : 'Item name').setStyle(TextInputStyle.Short).setRequired(true)));
}

function pulsarModal(fr: boolean): ModalBuilder {
  const c = getPulsarConfig();
  return new ModalBuilder().setCustomId('panel:modal:pulsar').setTitle(fr ? 'Paramètres Novus' : 'Novus settings').addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('h').setLabel(fr ? 'Heures entre posts (0.5-24)' : 'Hours between posts (0.5-24)').setStyle(TextInputStyle.Short).setValue(String(c.interval_hours)).setRequired(true)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('l').setLabel(fr ? 'Langue (ex. English, French)' : 'Language (e.g. English, French)').setStyle(TextInputStyle.Short).setValue(c.language).setRequired(true)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('r').setLabel(fr ? 'Heure du récap quotidien (UTC, ex. 20:00)' : 'Daily recap time (UTC, e.g. 20:00)').setStyle(TextInputStyle.Short).setValue(c.recap_time_utc).setRequired(true)));
}

function gameEditModal(key: string, fr: boolean): ModalBuilder {
  const cur = getGameConfig(key);
  const j = (cur?.config_json ?? {}) as Record<string, unknown>;
  const val = (k: string, fallback: string) => (j[k] === undefined ? fallback : String(j[k]));
  const row = (cid: string, label: string, value: string) =>
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId(cid).setLabel(label).setStyle(TextInputStyle.Short).setValue(value).setRequired(false));
  return new ModalBuilder()
    .setCustomId(`panel:modal:gameedit:${key}`)
    .setTitle((fr ? `Éditer ${labelFor(key)}` : `Edit ${labelFor(key)}`).replace(/^[^\p{L}\d]+/u, '').slice(0, 40))
    .addComponents(
      row('min', fr ? 'Mise min (PULSE)' : 'Min bet (PULSE)', val('min_bet', '0')),
      row('max', fr ? 'Mise max (PULSE)' : 'Max bet (PULSE)', val('max_bet', '0')),
      row('fee', fr ? 'Avantage maison % (0-100, + haut = - de gains)' : 'House edge % (0-100, higher = less wins)', val('fee_percent', '0')),
      row('cd', fr ? 'Cooldown en secondes' : 'Cooldown seconds', val('cooldown_seconds', '0')),
    );
}

function shopPriceModal(fr: boolean): ModalBuilder {
  return new ModalBuilder().setCustomId('panel:modal:shopprice').setTitle(fr ? 'Régler le prix' : 'Set item price').addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('name').setLabel(fr ? 'Nom de l\'objet' : 'Item name').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('price').setLabel(fr ? 'Nouveau prix en PULSE' : 'New price in PULSE').setStyle(TextInputStyle.Short).setRequired(true)));
}
