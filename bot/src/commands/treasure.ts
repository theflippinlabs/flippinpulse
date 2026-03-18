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
      embeds: [pulseEmbed('🏴‍☠️ Treasure Status').setDescription(
        `Claims today: **${claims}/${maxClaims}**`
      )],
      ephemeral: true,
    });
    return;
  }

  if (!isGameEnabled('treasure_drop')) {
    await interaction.reply({ embeds: [errorEmbed('Treasure Drop is currently disabled.')], ephemeral: true });
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
    await interaction.reply({ embeds: [errorEmbed('Failed to create treasure drop.')], ephemeral: true });
    return;
  }

  const claimBtn = new ButtonBuilder()
    .setCustomId(`treasure_claim_${sessionId}`)
    .setLabel('🏴‍☠️ Claim Treasure!')
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(claimBtn);

  const embed = pulseEmbed('🏴‍☠️ Treasure Drop!')
    .setDescription(
      `A treasure chest appeared!\n\n` +
      `💰 Contains **???** PULSE\n\n` +
      `First to claim it wins!`
    )
    .setThumbnail('https://em-content.zobj.net/thumbs/240/apple/354/pirate-flag_1f3f4-200d-2620-fe0f.png');

  const reply = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true }) as Message;

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 30_000,
    max: 1,
  });

  collector.on('collect', async (btnI) => {
    const maxClaims = conf.max_claims_per_user_per_day ?? 3;
    const canClaim = await checkGameLimit(btnI.user.id, 'treasure_claim', maxClaims);

    if (!canClaim) {
      await btnI.reply({ embeds: [errorEmbed('You reached your daily claim limit!')], ephemeral: true });
      return;
    }

    await earnPulse(btnI.user.id, reward, 'treasure_drop', sessionId);
    await incrementGameLimit(btnI.user.id, 'treasure_claim');
    await updateGameSession(sessionId, { status: 'completed', ended_at: new Date().toISOString() });
    await saveGameResult(sessionId, { claimedBy: btnI.user.id, reward });

    const winEmbed = successEmbed(
      `🏴‍☠️ **${btnI.user.username}** claimed the treasure!\n\n💰 Reward: **${reward}** PULSE`
    );

    await btnI.update({ embeds: [winEmbed], components: [] });
  });

  collector.on('end', async (collected) => {
    if (collected.size === 0) {
      await updateGameSession(sessionId, { status: 'cancelled', ended_at: new Date().toISOString() });
      const expiredEmbed = errorEmbed('The treasure vanished... nobody claimed it!').setTitle('🏴‍☠️ Treasure Drop');
      await interaction.editReply({ embeds: [expiredEmbed], components: [] }).catch(() => {});
    }
  });
}
