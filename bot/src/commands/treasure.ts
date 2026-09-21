import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  Message,
  TextChannel,
} from 'discord.js';
import { supabase } from '../supabase.js';
import {
  getGameConfig,
  isGameEnabled,
  createGameSession,
  updateGameSession,
  saveGameResult,
  earnPulse,
  checkGameLimit,
  incrementGameLimit,
} from '../services/games.js';
import { pulseEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';
import { log } from '../utils/logger.js';
import { getUserLocale } from '../i18n.js';

export const data = new SlashCommandBuilder()
  .setName('treasure')
  .setDescription('Drop a treasure for the channel to grab!')
  .addStringOption(opt =>
    opt.setName('action')
      .setDescription('What to do')
      .setRequired(true)
      .addChoices(
        { name: 'Drop a treasure', value: 'drop' },
        { name: 'Check my claims today', value: 'status' },
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';
  const action = interaction.options.getString('action', true);

  if (action === 'status') {
    const { data: limits } = await supabase
      .from('user_game_limits')
      .select('count, reset_at')
      .eq('discord_id', interaction.user.id)
      .eq('limit_key', 'treasure_claim')
      .single();

    const claims = limits?.count ?? 0;
    const cfg = getGameConfig('treasure_drop');
    const maxClaims = (cfg?.config_json as Record<string, number>)?.max_claims_per_user_per_day ?? 3;

    await interaction.reply({
      embeds: [pulseEmbed(en ? '🏴‍☠️ Treasure Status' : '🏴‍☠️ Statut du trésor').setDescription(
        en ? `Claims today: **${claims}/${maxClaims}**` : `Réclamations aujourd'hui : **${claims}/${maxClaims}**`
      )],
      ephemeral: true,
    });
    return;
  }

  if (!isGameEnabled('treasure_drop')) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'Treasure Drop is currently disabled.' : 'Treasure Drop est désactivé pour l\'instant.')], ephemeral: true });
    return;
  }

  const cfg = getGameConfig('treasure_drop');
  const conf = (cfg?.config_json ?? {}) as {
    min_reward: number;
    max_reward: number;
    max_claims_per_user_per_day: number;
  };
  const minReward = conf.min_reward ?? 5;
  const maxReward = conf.max_reward ?? 50;

  const reward = Math.floor(Math.random() * (maxReward - minReward + 1)) + minReward;

  const sessionId = await createGameSession('treasure_drop', interaction.channelId, { reward });
  if (!sessionId) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'Failed to create treasure drop.' : 'Impossible de créer le trésor.')], ephemeral: true });
    return;
  }

  const claimBtn = new ButtonBuilder()
    .setCustomId(`treasure_claim_${sessionId}`)
    .setLabel(en ? '🏴‍☠️ Claim Treasure!' : '🏴‍☠️ Réclamer le trésor !')
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(claimBtn);

  const embed = pulseEmbed(en ? '🏴‍☠️ Treasure Drop!' : '🏴‍☠️ Un trésor !')
    .setDescription(en
      ? `A treasure chest appeared!\n\n💰 Contains **???** PULSE\n\nFirst to claim it wins!`
      : `Un coffre au trésor est apparu !\n\n💰 Contient **???** PULSE\n\nLe premier qui le réclame gagne !`)
    .setThumbnail('https://em-content.zobj.net/thumbs/240/apple/354/pirate-flag_1f3f4-200d-2620-fe0f.png');

  const reply = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true }) as Message;

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 30_000,
    max: 1,
  });

  collector.on('collect', async (btnI) => {
    // Message goes to the claimer, so use THEIR locale.
    const claimerLocale = await getUserLocale(btnI.user.id);
    const cen = claimerLocale === 'en';
    const maxClaims = conf.max_claims_per_user_per_day ?? 3;
    const canClaim = await checkGameLimit(btnI.user.id, 'treasure_claim', maxClaims);

    if (!canClaim) {
      await btnI.reply({ embeds: [errorEmbed(cen ? 'You reached your daily claim limit!' : 'Tu as atteint ta limite journalière !')], ephemeral: true });
      return;
    }

    await earnPulse(btnI.user.id, reward, 'treasure_drop', sessionId);
    await incrementGameLimit(btnI.user.id, 'treasure_claim');
    await updateGameSession(sessionId, { status: 'completed', ended_at: new Date().toISOString() });
    await saveGameResult(sessionId, { claimedBy: btnI.user.id, reward });

    // Use the DROPPER's locale for the public announcement so it matches
    // the drop message language.
    const winEmbed = successEmbed(en
      ? `🏴‍☠️ **${btnI.user.username}** claimed the treasure!\n\n💰 Reward: **${reward}** PULSE`
      : `🏴‍☠️ **${btnI.user.username}** a réclamé le trésor !\n\n💰 Récompense : **${reward}** PULSE`);

    await btnI.update({ embeds: [winEmbed], components: [] });
  });

  collector.on('end', async (collected) => {
    if (collected.size === 0) {
      await updateGameSession(sessionId, { status: 'cancelled', ended_at: new Date().toISOString() });
      const expiredEmbed = errorEmbed(en ? 'The treasure vanished... nobody claimed it!' : 'Le trésor a disparu… personne ne l\'a réclamé !').setTitle(en ? '🏴‍☠️ Treasure Drop' : '🏴‍☠️ Trésor');
      await interaction.editReply({ embeds: [expiredEmbed], components: [] }).catch(() => {});
    }
  });
}
