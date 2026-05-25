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
import { supabase } from '../supabase.js';
import { pulseEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';
import { log } from '../utils/logger.js';

type Section = 'home' | 'modules' | 'channels' | 'quiz' | 'economy' | 'pulse' | 'shop' | 'pulsar' | 'missions';
type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

const SHOP_CATEGORIES = ['role', 'perk', 'ticket', 'cosmetic', 'irl'];

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
      { label: 'Give / remove PULSE', value: 'pulse', emoji: '🎁' },
      { label: 'Shop', value: 'shop', emoji: '🛒' },
      { label: 'Pulsar (AI host)', value: 'pulsar', emoji: '🤖' },
      { label: 'Missions', value: 'missions', emoji: '🎯' },
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
        `🧠 Auto-quiz: ${q ? `<#${q}>` : '*(not set)*'}\n\n` +
        `*Pulsar's channel is set in the **Pulsar** section.*`
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
      new ButtonBuilder().setCustomId('panel:quizping').setLabel(`@everyone: ${c.ping_everyone ? 'ON' : 'OFF'}`).setEmoji('📢').setStyle(ButtonStyle.Secondary),
    ));
    return {
      embeds: [pulseEmbed('🧠 Auto-quiz').setDescription(
        `**Status:** ${c.enabled ? 'ON ✅' : 'OFF ⛔'} · **Channel:** ${c.channel_id ? `<#${c.channel_id}>` : '*(set in Channels)*'}\n` +
        `**Daily times (UTC):** ${c.daily_times_utc.join(', ')}\n` +
        `**Questions:** ${c.questions_per_round}${c.bonus_enabled ? ' + 1 bonus (×2)' : ''} · **${c.seconds_per_question}s** · **+${c.reward_per_correct}** PULSE\n` +
        `**AI:** ${c.auto_generate ? `ON (${c.language})` : 'OFF'} · **Topics:** ${c.topics.join(', ')}\n` +
        `**Announce:** ${c.ping_everyone ? `@everyone ${c.announce_lead_minutes} min before` : 'silent'}`
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
        `*Use the **Give / remove PULSE** and **Shop** sections to manage members & items.*`
      )],
      components: rows,
    };
  }

  if (section === 'pulsar') {
    const c = getPulsarConfig();
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('panel:chan:pulsar').addChannelTypes(ChannelType.GuildText).setPlaceholder('🤖 Pulsar channel')));
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:pulsartoggle').setLabel(c.enabled ? 'Turn OFF' : 'Turn ON').setEmoji(c.enabled ? '⛔' : '✅').setStyle(c.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId('panel:pulsartag').setLabel(`Tag members: ${c.tag_active_members ? 'ON' : 'OFF'}`).setEmoji('🏷️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:pulsarreply').setLabel(`Replies: ${c.reply_to_mentions ? 'ON' : 'OFF'}`).setEmoji('💬').setStyle(ButtonStyle.Secondary),
    ));
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:pulsarwelcome').setLabel(`Welcomes: ${c.welcome ? 'ON' : 'OFF'}`).setEmoji('👋').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:pulsarevents').setLabel(`Host events: ${c.host_events ? 'ON' : 'OFF'}`).setEmoji('🎤').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:pulsarrecap').setLabel(`Daily recap: ${c.recap ? 'ON' : 'OFF'}`).setEmoji('📰').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:pulsarcelebrate').setLabel(`Celebrate: ${c.celebrate ? 'ON' : 'OFF'}`).setEmoji('🎉').setStyle(ButtonStyle.Secondary),
    ));
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:pulsartune').setLabel('Settings').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:pulsarnow').setLabel('Post now').setEmoji('🤖').setStyle(ButtonStyle.Primary),
    ));
    return {
      embeds: [pulseEmbed('🤖 Pulsar — AI community host').setDescription(
        `**Status:** ${c.enabled ? 'ON ✅' : 'OFF ⛔'} · **Channel:** ${c.channel_id ? `<#${c.channel_id}>` : '*(pick one above)*'}\n` +
        `**Posts to engage:** about every **${c.interval_hours}h** — even when it's quiet, to revive the chat\n` +
        `**Tags members:** ${c.tag_active_members ? 'ON' : 'OFF'} · **Replies when mentioned:** ${c.reply_to_mentions ? 'ON' : 'OFF'}\n` +
        `**Welcomes:** ${c.welcome ? 'ON' : 'OFF'} · **Host events:** ${c.host_events ? 'ON' : 'OFF'} · **Recap (${c.recap_time_utc} UTC):** ${c.recap ? 'ON' : 'OFF'} · **Celebrate:** ${c.celebrate ? 'ON' : 'OFF'}\n` +
        `**Language:** ${c.language}\n\n` +
        `${process.env.ANTHROPIC_API_KEY ? 'Pulsar welcomes newcomers, hosts events, celebrates wins and keeps the vibe going. 🎉' : '⚠️ Set `ANTHROPIC_API_KEY` in Railway to power Pulsar.'}`
      )],
      components: rows,
    };
  }

  if (section === 'missions') {
    const ch = getPulsarConfig().channel_id;
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:missionflash').setLabel('Flash challenge').setEmoji('⚡').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('panel:missionriddle').setLabel('Riddle').setEmoji('🧩').setStyle(ButtonStyle.Primary),
    ));
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:missiondaily').setLabel('Daily objective').setEmoji('📅').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:missionweekly').setLabel('Weekly objective').setEmoji('🗓️').setStyle(ButtonStyle.Secondary),
    ));
    const c = getPulsarConfig();
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('panel:missionlist').setLabel('List active').setEmoji('📋').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('panel:missionend').setLabel('End all').setEmoji('🛑').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('panel:missionauto').setLabel(`Auto-launch: ${c.missions ? 'ON' : 'OFF'}`).setEmoji('🔁').setStyle(ButtonStyle.Secondary),
    ));
    return {
      embeds: [pulseEmbed('🎯 Missions').setDescription(
        `Launch a mission now — it posts in Pulsar's channel ${ch ? `(<#${ch}>)` : '*(set one in the Pulsar section first)*'}.\n\n` +
        `⚡ **Flash** — first 3 to claim win 50 PULSE (30 min)\n` +
        `🧩 **Riddle** — first to solve wins 100 PULSE (needs AI key)\n` +
        `📅 **Daily** — send 20 messages · 🗓️ **Weekly** — play 5 games (auto-tracked, credits PULSE)\n\n` +
        `🔁 **Auto-launch:** ${c.missions ? `ON — Pulsar starts one about every ${c.mission_interval_hours}h` : 'OFF'} (needs Pulsar ON).`
      )],
      components: rows,
    };
  }

  if (section === 'pulse') return renderPulse();
  if (section === 'shop') return renderShop();

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
      `**Auto-quiz:** ${getAutoQuizConfig().enabled ? 'ON ✅' : 'OFF ⛔'} · **Pulsar:** ${getPulsarConfig().enabled ? 'ON ✅' : 'OFF ⛔'}\n\n` +
      '*Sections: Modules · Channels · Auto-quiz · Economy · Give/remove PULSE · Shop · Pulsar.*'
    )],
    components: rows,
  };
}

function renderPulse(selectedUserId?: string): { embeds: ReturnType<typeof pulseEmbed>[]; components: Row[] } {
  const rows: Row[] = [navRow()];
  rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new UserSelectMenuBuilder().setCustomId('panel:pulseuser').setPlaceholder('👤 Pick a member…').setMinValues(1).setMaxValues(1)));

  if (selectedUserId) {
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`panel:pulse:give:${selectedUserId}`).setLabel('Give').setEmoji('➕').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`panel:pulse:remove:${selectedUserId}`).setLabel('Remove').setEmoji('➖').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`panel:pulse:set:${selectedUserId}`).setLabel('Set exact').setEmoji('🎯').setStyle(ButtonStyle.Secondary),
    ));
  }

  return {
    embeds: [pulseEmbed('🎁 Give / remove PULSE').setDescription(
      selectedUserId
        ? `Selected: <@${selectedUserId}>\n\nChoose an action below — you'll be asked for an amount.`
        : 'Pick a member, then choose **Give**, **Remove**, or **Set exact**.'
    )],
    components: rows,
  };
}

function renderShop(): { embeds: ReturnType<typeof pulseEmbed>[]; components: Row[] } {
  const rows: Row[] = [navRow()];
  rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId('panel:shop:add').setLabel('Add item').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel:shop:list').setLabel('List items').setEmoji('📋').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('panel:shop:remove').setLabel('Hide item').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
  ));
  rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId('panel:shop:price').setLabel('Set price').setEmoji('💱').setStyle(ButtonStyle.Secondary),
  ));
  return {
    embeds: [pulseEmbed('🛒 Shop').setDescription(
      `Manage the PULSE shop:\n\n` +
      `➕ **Add item** · 📋 **List** · 🗑️ **Hide** · 💱 **Set price**\n\n` +
      `Categories: ${SHOP_CATEGORIES.join(', ')}.`
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

  // PULSE member picker
  if (interaction.isUserSelectMenu() && interaction.customId === 'panel:pulseuser') {
    await interaction.update(renderPulse(interaction.values[0]));
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
    await interaction.update(render(which === 'pulsar' ? 'pulsar' : 'channels'));
    return;
  }

  if (interaction.isButton()) {
    const id = interaction.customId;

    if (id === 'panel:refresh') { await interaction.update(render('home')); return; }

    if (id === 'panel:quiztoggle') { await patch('auto_quiz', { enabled: !getAutoQuizConfig().enabled }); await interaction.update(render('quiz')); return; }
    if (id === 'panel:quizbonus') { await patch('auto_quiz', { bonus_enabled: !getAutoQuizConfig().bonus_enabled }); await interaction.update(render('quiz')); return; }
    if (id === 'panel:quizping') { await patch('auto_quiz', { ping_everyone: !getAutoQuizConfig().ping_everyone }); await interaction.update(render('quiz')); return; }

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

    // Pulsar
    if (id === 'panel:pulsartoggle') { await patch('pulsar_config', { enabled: !getPulsarConfig().enabled }); await interaction.update(render('pulsar')); return; }
    if (id === 'panel:pulsartag') { await patch('pulsar_config', { tag_active_members: !getPulsarConfig().tag_active_members }); await interaction.update(render('pulsar')); return; }
    if (id === 'panel:pulsarreply') { await patch('pulsar_config', { reply_to_mentions: !getPulsarConfig().reply_to_mentions }); await interaction.update(render('pulsar')); return; }
    if (id === 'panel:pulsarwelcome') { await patch('pulsar_config', { welcome: !getPulsarConfig().welcome }); await interaction.update(render('pulsar')); return; }
    if (id === 'panel:pulsarevents') { await patch('pulsar_config', { host_events: !getPulsarConfig().host_events }); await interaction.update(render('pulsar')); return; }
    if (id === 'panel:pulsarrecap') { await patch('pulsar_config', { recap: !getPulsarConfig().recap }); await interaction.update(render('pulsar')); return; }
    if (id === 'panel:pulsarcelebrate') { await patch('pulsar_config', { celebrate: !getPulsarConfig().celebrate }); await interaction.update(render('pulsar')); return; }
    if (id === 'panel:pulsartune') { await interaction.showModal(pulsarModal()); return; }
    if (id === 'panel:pulsarnow') {
      const cfg = getPulsarConfig();
      if (!cfg.channel_id) { await interaction.reply({ embeds: [errorEmbed('Pick a Pulsar channel first.')], flags: MessageFlags.Ephemeral }); return; }
      if (!process.env.ANTHROPIC_API_KEY) { await interaction.reply({ embeds: [errorEmbed('Set `ANTHROPIC_API_KEY` in Railway to power Pulsar.')], flags: MessageFlags.Ephemeral }); return; }
      if (!interaction.guild) { await interaction.reply({ embeds: [errorEmbed('Use this in a server.')], flags: MessageFlags.Ephemeral }); return; }
      await interaction.reply({ embeds: [successEmbed('Pulsar is posting now! 🤖')], flags: MessageFlags.Ephemeral });
      void pulsarPostNow(interaction.client, interaction.guild.id);
      return;
    }

    // Missions
    if (id.startsWith('panel:mission')) {
      const ch = getPulsarConfig().channel_id;
      if (id === 'panel:missionlist') {
        const active = await listActiveChallenges();
        const desc = active.length
          ? active.map(m => `• **${m.title}** (${m.kind})${m.goal ? ` — goal ${m.goal}` : ''} · ${m.reward} PULSE`).join('\n')
          : 'No active missions right now.';
        await interaction.reply({ embeds: [pulseEmbed('🎯 Active missions').setDescription(desc.slice(0, 4000))], flags: MessageFlags.Ephemeral });
        return;
      }
      if (id === 'panel:missionend') {
        const n = await endAllChallenges(interaction.client);
        await interaction.reply({ embeds: [successEmbed(`Ended **${n}** active mission${n === 1 ? '' : 's'}.`)], flags: MessageFlags.Ephemeral });
        return;
      }
      if (id === 'panel:missionauto') { await patch('pulsar_config', { missions: !getPulsarConfig().missions }); await interaction.update(render('missions')); return; }
      if (!ch) { await interaction.reply({ embeds: [errorEmbed('Set a Pulsar channel first (Pulsar section).')], flags: MessageFlags.Ephemeral }); return; }
      await interaction.reply({ embeds: [successEmbed('Launching the mission now! 🎯')], flags: MessageFlags.Ephemeral });
      if (id === 'panel:missionflash') void launchFlash(interaction.client, ch, { reward: 50, maxWinners: 3, durationMin: 30 });
      else if (id === 'panel:missionriddle') void launchRiddle(interaction.client, ch, { reward: 100, durationMin: 60 });
      else if (id === 'panel:missiondaily') void launchObjective(interaction.client, ch, { kind: 'daily', metric: 'messages', goal: 20, reward: 60 });
      else if (id === 'panel:missionweekly') void launchObjective(interaction.client, ch, { kind: 'weekly', metric: 'games_played', goal: 5, reward: 250 });
      return;
    }

    // PULSE actions: panel:pulse:<action>:<userId>
    if (id.startsWith('panel:pulse:')) {
      const [, , action, userId] = id.split(':');
      await interaction.showModal(pulseModal(action, userId));
      return;
    }

    // Shop actions
    if (id === 'panel:shop:add') { await interaction.showModal(shopAddModal()); return; }
    if (id === 'panel:shop:remove') { await interaction.showModal(shopNameModal('remove', 'Hide a shop item')); return; }
    if (id === 'panel:shop:price') { await interaction.showModal(shopPriceModal()); return; }
    if (id === 'panel:shop:list') {
      const { data: items } = await supabase
        .from('shop_items')
        .select('name, price_pulse, category, is_active, stock_remaining')
        .order('price_pulse', { ascending: true })
        .limit(40);
      const desc = !items?.length
        ? 'No items yet. Use **Add item**.'
        : items.map(i => {
            const stock = i.stock_remaining !== null ? ` · ${i.stock_remaining} left` : '';
            return `${i.is_active ? '🟢' : '⚫'} **${i.name}** — ${i.price_pulse} PULSE · ${i.category}${stock}`;
          }).join('\n');
      await interaction.reply({ embeds: [pulseEmbed('🛒 Shop items').setDescription(desc.slice(0, 4000))], flags: MessageFlags.Ephemeral });
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
      if (id === 'panel:modal:pulsar') {
        const c = getPulsarConfig();
        const hrs = Number(interaction.fields.getTextInputValue('h'));
        const recapTime = interaction.fields.getTextInputValue('r').trim();
        await patch('pulsar_config', {
          interval_hours: Number.isFinite(hrs) && hrs >= 0.5 ? Math.min(24, hrs) : c.interval_hours,
          language: interaction.fields.getTextInputValue('l').trim() || c.language,
          recap_time_utc: /^\d{1,2}:\d{2}$/.test(recapTime) ? recapTime : c.recap_time_utc,
        });
        await interaction.reply({ embeds: [successEmbed('Pulsar settings updated.')], flags: MessageFlags.Ephemeral });
        return;
      }

      // PULSE give/remove/set: panel:modal:pulse:<action>:<userId>
      if (id.startsWith('panel:modal:pulse:')) {
        const [, , , action, userId] = id.split(':');
        const amount = Number(interaction.fields.getTextInputValue('amt'));
        const reason = (interaction.fields.getTextInputValue('reason') || 'Admin panel').trim();
        if (!Number.isFinite(amount) || amount < (action === 'set' ? 0 : 1)) {
          await interaction.reply({ embeds: [errorEmbed('Enter a valid amount.')], flags: MessageFlags.Ephemeral });
          return;
        }
        const user = await interaction.client.users.fetch(userId).catch(() => null);
        if (!user || user.bot) {
          await interaction.reply({ embeds: [errorEmbed('That member could not be found.')], flags: MessageFlags.Ephemeral });
          return;
        }
        const res = action === 'give'
          ? await grantPulse(user.id, user.username, user.displayAvatarURL(), amount, reason, interaction.user.id)
          : action === 'remove'
            ? await revokePulse(user.id, amount, reason, interaction.user.id)
            : await setPulse(user.id, user.username, user.displayAvatarURL(), amount, reason, interaction.user.id);
        if (!res.success) {
          await interaction.reply({ embeds: [errorEmbed(res.error ?? 'Failed.')], flags: MessageFlags.Ephemeral });
          return;
        }
        const verb = action === 'give' ? 'Gave' : action === 'remove' ? 'Removed' : 'Set balance for';
        await interaction.reply({ embeds: [successEmbed(`${verb} **${amount}** PULSE — <@${user.id}> now has **${res.newBalance}** PULSE.`)], flags: MessageFlags.Ephemeral });
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
          await interaction.reply({ embeds: [errorEmbed('Enter a name and a valid price.')], flags: MessageFlags.Ephemeral });
          return;
        }
        const { error } = await supabase.from('shop_items').insert({
          name, description, category, price_pulse: Math.floor(price),
          stock_total: stock, stock_remaining: stock, max_per_user: 1, is_active: true,
        });
        if (error) { await interaction.reply({ embeds: [errorEmbed(`Could not add item: ${error.message}`)], flags: MessageFlags.Ephemeral }); return; }
        await interaction.reply({ embeds: [successEmbed(`Added **${name}** — ${Math.floor(price)} PULSE (${category})${stock ? `, stock ${stock}` : ''}.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      if (id === 'panel:modal:shopremove' || id === 'panel:modal:shopprice') {
        const name = interaction.fields.getTextInputValue('name').trim();
        const { data: item } = await supabase.from('shop_items').select('id, name').ilike('name', name).limit(1).maybeSingle();
        if (!item) { await interaction.reply({ embeds: [errorEmbed(`No item named "${name}". Use **List items** to check.`)], flags: MessageFlags.Ephemeral }); return; }
        if (id === 'panel:modal:shopremove') {
          await supabase.from('shop_items').update({ is_active: false }).eq('id', item.id);
          await interaction.reply({ embeds: [successEmbed(`**${item.name}** is now hidden from the shop.`)], flags: MessageFlags.Ephemeral });
        } else {
          const price = Number(interaction.fields.getTextInputValue('price'));
          if (!Number.isFinite(price) || price < 0) { await interaction.reply({ embeds: [errorEmbed('Enter a valid price.')], flags: MessageFlags.Ephemeral }); return; }
          await supabase.from('shop_items').update({ price_pulse: Math.floor(price) }).eq('id', item.id);
          await interaction.reply({ embeds: [successEmbed(`**${item.name}** price set to **${Math.floor(price)}** PULSE.`)], flags: MessageFlags.Ephemeral });
        }
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

function pulseModal(action: string, userId: string): ModalBuilder {
  const title = action === 'give' ? 'Give PULSE' : action === 'remove' ? 'Remove PULSE' : 'Set PULSE balance';
  return new ModalBuilder().setCustomId(`panel:modal:pulse:${action}:${userId}`).setTitle(title).addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('amt').setLabel(action === 'set' ? 'Exact balance' : 'Amount').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('reason').setLabel('Reason (optional)').setStyle(TextInputStyle.Short).setRequired(false)));
}

function shopAddModal(): ModalBuilder {
  const f = (cid: string, label: string, required: boolean, style = TextInputStyle.Short) =>
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId(cid).setLabel(label).setStyle(style).setRequired(required));
  return new ModalBuilder().setCustomId('panel:modal:shopadd').setTitle('Add shop item').addComponents(
    f('name', 'Item name', true),
    f('price', 'Price in PULSE', true),
    f('category', `Category (${SHOP_CATEGORIES.join('/')})`, false),
    f('description', 'Description (optional)', false, TextInputStyle.Paragraph),
    f('stock', 'Stock (blank = unlimited)', false));
}

function shopNameModal(kind: string, title: string): ModalBuilder {
  return new ModalBuilder().setCustomId(`panel:modal:shop${kind}`).setTitle(title).addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('name').setLabel('Item name').setStyle(TextInputStyle.Short).setRequired(true)));
}

function pulsarModal(): ModalBuilder {
  const c = getPulsarConfig();
  return new ModalBuilder().setCustomId('panel:modal:pulsar').setTitle('Pulsar settings').addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('h').setLabel('Hours between posts (0.5-24)').setStyle(TextInputStyle.Short).setValue(String(c.interval_hours)).setRequired(true)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('l').setLabel('Language (e.g. English, French)').setStyle(TextInputStyle.Short).setValue(c.language).setRequired(true)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('r').setLabel('Daily recap time (UTC, e.g. 20:00)').setStyle(TextInputStyle.Short).setValue(c.recap_time_utc).setRequired(true)));
}

function shopPriceModal(): ModalBuilder {
  return new ModalBuilder().setCustomId('panel:modal:shopprice').setTitle('Set item price').addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('name').setLabel('Item name').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('price').setLabel('New price in PULSE').setStyle(TextInputStyle.Short).setRequired(true)));
}
