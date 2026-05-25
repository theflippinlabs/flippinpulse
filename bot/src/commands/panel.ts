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
} from 'discord.js';
import {
  getRawSetting, setSetting,
  getWelcomeConfig, getRankUpConfig, getModConfig, getPulseHourConfig,
  getDailyCapConfig, getStreakConfig, getDecayConfig, getEconomyConfig, getPointsConfig,
} from '../services/settings.js';
import { getAutoQuizConfig, launchQuiz } from '../services/communityQuiz.js';
import { pulseEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';
import { log } from '../utils/logger.js';

type Section = 'home' | 'modules' | 'channels' | 'quiz' | 'economy';
type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

interface Module { label: string; emoji: string; settingKey: string; field: string; read: () => boolean; }

const MODULES: Record<string, Module> = {
  welcome: { label: 'Welcome messages', emoji: '👋', settingKey: 'welcome_config', field: 'enabled', read: () => getWelcomeConfig().enabled },
  rankup: { label: 'Rank-up announcements', emoji: '🚀', settingKey: 'rank_up_config', field: 'enabled', read: () => getRankUpConfig().enabled },
  automod: { label: 'Auto-moderation', emoji: '🛡️', settingKey: 'mod_config', field: 'automod_enabled', read: () => getModConfig().automod_enabled },
  pulsehour: { label: 'Pulse Hour', emoji: '⚡', settingKey: 'pulse_hour', field: 'enabled', read: () => getPulseHourConfig().enabled },
  dailycap: { label: 'Daily PULSE cap', emoji: '🧢', settingKey: 'daily_cap_config', field: 'enabled', read: () => getDailyCapConfig().enabled },
  streak: { label: 'Streak bonus', emoji: '🔥', settingKey: 'streak_config', field: 'enabled', read: () => getStreakConfig().enabled },
  decay: { label: 'Point decay', emoji: '📉', settingKey: 'decay', field: 'enabled', read: () => getDecayConfig().enabled },
};

async function patch(settingKey: string, fields: Record<string, unknown>): Promise<void> {
  const cur = { ...(getRawSetting(settingKey) ?? {}) } as Record<string, unknown>;
  await setSetting(settingKey, { ...cur, ...fields });
}

function navRow(): Row {
  const select = new StringSelectMenuBuilder()
    .setCustomId('panel:nav')
    .setPlaceholder('📂 Go to a section…')
    .addOptions(
      { label: 'Home', value: 'home', emoji: '🏠' },
      { label: 'Modules (on/off)', value: 'modules', emoji: '⚙️' },
      { label: 'Channels', value: 'channels', emoji: '#️⃣' },
      { label: 'Auto-quiz', value: 'quiz', emoji: '🧠' },
      { label: 'Economy', value: 'economy', emoji: '💰' },
    );
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select);
}

function render(section: Section): { embeds: ReturnType<typeof pulseEmbed>[]; components: Row[] } {
  const rows: Row[] = [navRow()];

  if (section === 'modules') {
    const select = new StringSelectMenuBuilder()
      .setCustomId('panel:toggle')
      .setPlaceholder('⚙️ Tap a feature to turn it on/off')
      .addOptions(Object.entries(MODULES).map(([key, m]) => ({
        label: m.label, value: key, emoji: m.emoji,
        description: m.read() ? 'Currently ON — tap to turn off' : 'Currently OFF — tap to turn on',
      })));
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select));
    const lines = Object.values(MODULES).map(m => `${m.read() ? '✅' : '⛔'} ${m.emoji} ${m.label}`);
    return { embeds: [pulseEmbed('⚙️ Modules').setDescription(lines.join('\n'))], components: rows };
  }

  if (section === 'channels') {
    const w = getWelcomeConfig().channel_id, r = getRankUpConfig().channel_id;
    const ml = getModConfig().mod_log_channel_id, q = getAutoQuizConfig().channel_id;
    const mk = (id: string, label: string) =>
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ChannelSelectMenuBuilder().setCustomId(id).addChannelTypes(ChannelType.GuildText).setPlaceholder(label));
    rows.push(mk('panel:chan:welcome', '👋 Welcome channel'));
    rows.push(mk('panel:chan:rankup', '🚀 Rank-up channel'));
    rows.push(mk('panel:chan:modlog', '🛡️ Mod-log channel'));
    rows.push(mk('panel:chan:autoquiz', '🧠 Auto-quiz channel'));
    return {
      embeds: [pulseEmbed('#️⃣ Channels').setDescription(
        `Pick a channel for each:\n\n` +
        `👋 Welcome: ${w ? `<#${w}>` : '*(not set)*'}\n` +
        `🚀 Rank-up: ${r ? `<#${r}>` : '*(not set)*'}\n` +
        `🛡️ Mod-log: ${ml ? `<#${ml}>` : '*(not set)*'}\n` +
        `🧠 Auto-quiz: ${q ? `<#${q}>` : '*(not set)*'}`
      )],
      components: rows,
    };
  }

  if (section === 'quiz') {
    const c = getAutoQuizConfig();
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:quiztoggle').setLabel(c.enabled ? 'Turn OFF' : 'Turn ON').setEmoji(c.enabled ? '⛔' : '✅').setStyle(c.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId('panel:quizbonus').setLabel(`Bonus: ${c.bonus_enabled ? 'ON' : 'OFF'}`).setEmoji('🌟').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:quiznow').setLabel('Launch now').setEmoji('🧠').setStyle(ButtonStyle.Primary),
    ));
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:quiztimes').setLabel('Set times').setEmoji('🕐').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:quiztopics').setLabel('Set topics').setEmoji('🏷️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:quiznums').setLabel('Set numbers').setEmoji('🔢').setStyle(ButtonStyle.Secondary),
    ));
    return {
      embeds: [pulseEmbed('🧠 Auto-quiz').setDescription(
        `**Status:** ${c.enabled ? 'ON ✅' : 'OFF ⛔'} · **Channel:** ${c.channel_id ? `<#${c.channel_id}>` : '*(set in Channels)*'}\n` +
        `**Daily times (UTC):** ${c.daily_times_utc.join(', ')}\n` +
        `**Questions:** ${c.questions_per_round}${c.bonus_enabled ? ' + 1 bonus (×2)' : ''} · **${c.seconds_per_question}s** · **+${c.reward_per_correct}** PULSE\n` +
        `**AI:** ${c.auto_generate ? `ON (${c.language})` : 'OFF'} · **Topics:** ${c.topics.join(', ')}`
      )],
      components: rows,
    };
  }

  if (section === 'economy') {
    const e = getEconomyConfig(); const p = getPointsConfig();
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:ecotune').setLabel('Tune economy').setEmoji('🪙').setStyle(ButtonStyle.Primary),
    ));
    return {
      embeds: [pulseEmbed('💰 Economy').setDescription(
        `**PULSE per point:** ${e.pulse_per_point}\n` +
        `**Points — message:** ${p.message} · **reaction:** ${p.reaction} · **voice/min:** ${p.voice_per_minute}\n\n` +
        `*Give/remove PULSE uses \`/givepulse\` etc. (member picker). Shop uses \`/shopadmin\`.*`
      )],
      components: rows,
    };
  }

  // home
  const modLines = Object.values(MODULES).map(m => `${m.read() ? '✅' : '⛔'} ${m.emoji}`).join('  ');
  rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId('panel:quiznow').setLabel('Launch quiz now').setEmoji('🧠').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel:refresh').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
  ));
  return {
    embeds: [pulseEmbed('🛠️ Pulse Engine — Admin Panel').setDescription(
      'Use the **section menu** above to configure everything.\n\n' +
      `**Modules:** ${modLines}\n` +
      `**Auto-quiz:** ${getAutoQuizConfig().enabled ? 'ON ✅' : 'OFF ⛔'}\n\n` +
      '*Sections: Modules · Channels · Auto-quiz · Economy. Giving PULSE & shop stay on `/givepulse` / `/shopadmin`.*'
    )],
    components: rows,
  };
}

export const data = new SlashCommandBuilder()
  .setName('panel')
  .setDescription('Admin: open the control panel')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.reply({ ...render('home'), flags: MessageFlags.Ephemeral });
}

export async function handlePanelInteraction(interaction: Interaction): Promise<void> {
  // Navigation
  if (interaction.isStringSelectMenu() && interaction.customId === 'panel:nav') {
    await interaction.update(render(interaction.values[0] as Section));
    return;
  }

  // Module toggle
  if (interaction.isStringSelectMenu() && interaction.customId === 'panel:toggle') {
    const m = MODULES[interaction.values[0]];
    if (m) await patch(m.settingKey, { [m.field]: !m.read() });
    await interaction.update(render('modules'));
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
    await interaction.update(render('channels'));
    return;
  }

  if (interaction.isButton()) {
    const id = interaction.customId;

    if (id === 'panel:refresh') { await interaction.update(render('home')); return; }

    if (id === 'panel:quiztoggle') { await patch('auto_quiz', { enabled: !getAutoQuizConfig().enabled }); await interaction.update(render('quiz')); return; }
    if (id === 'panel:quizbonus') { await patch('auto_quiz', { bonus_enabled: !getAutoQuizConfig().bonus_enabled }); await interaction.update(render('quiz')); return; }

    if (id === 'panel:quiznow') {
      const channel = interaction.channel;
      if (!channel || !channel.isTextBased() || channel.isDMBased()) {
        await interaction.reply({ embeds: [errorEmbed('Use this in a text channel.')], flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply({ embeds: [successEmbed('Launching a quiz here now! 🧠 (generating questions…)')], flags: MessageFlags.Ephemeral });
      void launchQuiz(channel as GuildTextBasedChannel, getAutoQuizConfig());
      return;
    }

    if (id === 'panel:quiztimes') { await interaction.showModal(timesModal()); return; }
    if (id === 'panel:quiztopics') { await interaction.showModal(topicsModal()); return; }
    if (id === 'panel:quiznums') { await interaction.showModal(numsModal()); return; }
    if (id === 'panel:ecotune') { await interaction.showModal(ecoModal()); return; }
    return;
  }

  // Modal submissions
  if (interaction.isModalSubmit()) {
    const id = interaction.customId;
    try {
      if (id === 'panel:modal:times') {
        const times = interaction.fields.getTextInputValue('v').split(',').map(t => t.trim()).filter(t => /^\d{1,2}:\d{2}$/.test(t));
        if (!times.length) { await interaction.reply({ embeds: [errorEmbed('Use UTC times like 18:00,00:00')], flags: MessageFlags.Ephemeral }); return; }
        await patch('auto_quiz', { daily_times_utc: times });
        await setSetting('auto_quiz_state', { fired: {} });
        await interaction.reply({ embeds: [successEmbed(`Daily quiz times: **${times.join(', ')} UTC**.`)], flags: MessageFlags.Ephemeral });
        return;
      }
      if (id === 'panel:modal:topics') {
        const topics = interaction.fields.getTextInputValue('v').split(',').map(t => t.trim()).filter(Boolean);
        if (!topics.length) { await interaction.reply({ embeds: [errorEmbed('Give at least one topic.')], flags: MessageFlags.Ephemeral }); return; }
        await patch('auto_quiz', { topics });
        await interaction.reply({ embeds: [successEmbed(`Quiz topics: ${topics.join(', ')}.`)], flags: MessageFlags.Ephemeral });
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
        await interaction.reply({ embeds: [successEmbed('Quiz numbers updated.')], flags: MessageFlags.Ephemeral });
        return;
      }
      if (id === 'panel:modal:eco') {
        const num = (k: string, fallback: number) => { const n = Number(interaction.fields.getTextInputValue(k)); return Number.isFinite(n) && n >= 0 ? n : fallback; };
        const e = getEconomyConfig(); const p = getPointsConfig();
        await patch('economy', { pulse_per_point: num('ppp', e.pulse_per_point) });
        await patch('points_config', { message: num('m', p.message), reaction: num('re', p.reaction), voice_per_minute: num('v', p.voice_per_minute) });
        await interaction.reply({ embeds: [successEmbed('Economy updated.')], flags: MessageFlags.Ephemeral });
        return;
      }
    } catch (err) {
      log('ERROR', 'Panel modal failed', err);
      if (!interaction.replied) await interaction.reply({ embeds: [errorEmbed('Failed to save.')], flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

function oneField(modalId: string, title: string, label: string, value: string, style = TextInputStyle.Short): ModalBuilder {
  return new ModalBuilder().setCustomId(modalId).setTitle(title).addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('v').setLabel(label).setStyle(style).setValue(value).setRequired(true)));
}

function timesModal(): ModalBuilder {
  return oneField('panel:modal:times', 'Daily quiz times (UTC)', 'Comma-separated, e.g. 18:00,00:00', getAutoQuizConfig().daily_times_utc.join(', '));
}
function topicsModal(): ModalBuilder {
  return oneField('panel:modal:topics', 'AI quiz topics', 'Comma-separated topics', getAutoQuizConfig().topics.join(', '), TextInputStyle.Paragraph);
}
function numsModal(): ModalBuilder {
  const c = getAutoQuizConfig();
  const f = (cid: string, label: string, val: string) =>
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId(cid).setLabel(label).setStyle(TextInputStyle.Short).setValue(val).setRequired(true));
  return new ModalBuilder().setCustomId('panel:modal:nums').setTitle('Quiz numbers').addComponents(
    f('q', 'Questions per round (1-15)', String(c.questions_per_round)),
    f('s', 'Seconds per question (5-120)', String(c.seconds_per_question)),
    f('r', 'PULSE per correct answer', String(c.reward_per_correct)),
    f('l', 'Language (e.g. English, French)', c.language));
}
function ecoModal(): ModalBuilder {
  const e = getEconomyConfig(); const p = getPointsConfig();
  const f = (cid: string, label: string, val: string) =>
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId(cid).setLabel(label).setStyle(TextInputStyle.Short).setValue(val).setRequired(true));
  return new ModalBuilder().setCustomId('panel:modal:eco').setTitle('Economy settings').addComponents(
    f('ppp', 'PULSE per activity point', String(e.pulse_per_point)),
    f('m', 'Points per message', String(p.message)),
    f('re', 'Points per reaction', String(p.reaction)),
    f('v', 'Points per voice minute', String(p.voice_per_minute)));
}
