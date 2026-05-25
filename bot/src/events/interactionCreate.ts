import { ButtonInteraction, Interaction, MessageFlags } from 'discord.js';
import { runWithGuild } from '../guildContext.js';
import { commands } from '../commands/index.js';
import {
  GIVEAWAY_BUTTON_ID,
  addEntry,
  buildGiveawayEmbed,
  countEntries,
  getGiveawayByMessage,
} from '../services/giveaways.js';
import { handleLobbyButton } from '../services/lobby.js';
import { handlePanelInteraction } from '../commands/panel.js';
import { handleChallengeInteraction } from '../services/challenges.js';
import { log } from '../utils/logger.js';

async function handleGiveawayButton(interaction: ButtonInteraction): Promise<void> {
  const g = await getGiveawayByMessage(interaction.message.id);
  if (!g) {
    await interaction.reply({ content: 'This giveaway is no longer tracked.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (g.status !== 'active') {
    await interaction.reply({ content: 'This giveaway has ended.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (new Date(g.end_at).getTime() <= Date.now()) {
    await interaction.reply({ content: 'This giveaway just ended — winners will be announced shortly.', flags: MessageFlags.Ephemeral });
    return;
  }

  const added = await addEntry(g.id, interaction.user.id);
  if (!added) {
    await interaction.reply({ content: 'You are already entered in this giveaway.', flags: MessageFlags.Ephemeral });
    return;
  }

  const entryCount = await countEntries(g.id);
  await interaction.message.edit({ embeds: [buildGiveawayEmbed(g, entryCount)] }).catch(() => null);
  await interaction.reply({ content: `🎉 You are entered! Total entries: ${entryCount}`, flags: MessageFlags.Ephemeral });
}

export async function handleInteractionCreate(interaction: Interaction): Promise<void> {
  if (
    (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isChannelSelectMenu() || interaction.isUserSelectMenu() || interaction.isModalSubmit())
    && interaction.customId.startsWith('panel:')
  ) {
    if (!interaction.guildId) return;
    try {
      await runWithGuild(interaction.guildId, () => handlePanelInteraction(interaction));
    } catch (err) {
      log('ERROR', 'Panel interaction handler crashed', err);
    }
    return;
  }

  if (
    (interaction.isButton() || interaction.isModalSubmit())
    && interaction.customId.startsWith('challenge:')
  ) {
    if (!interaction.guildId) return;
    try {
      await runWithGuild(interaction.guildId, () => handleChallengeInteraction(interaction));
    } catch (err) {
      log('ERROR', 'Challenge interaction handler crashed', err);
    }
    return;
  }

  if (interaction.isButton()) {
    if (!interaction.guildId) return;
    const gid = interaction.guildId;
    if (interaction.customId.startsWith('lobby_')) {
      try {
        await runWithGuild(gid, () => handleLobbyButton(interaction));
      } catch (err) {
        log('ERROR', 'Lobby button handler crashed', err);
      }
      return;
    }
    if (interaction.customId === GIVEAWAY_BUTTON_ID) {
      try {
        await runWithGuild(gid, () => handleGiveawayButton(interaction));
      } catch (err) {
        log('ERROR', 'Giveaway button handler crashed', err);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  if (!interaction.guildId) {
    await interaction.reply({ content: 'This bot only works inside a server.', flags: MessageFlags.Ephemeral });
    return;
  }
  const gid = interaction.guildId;

  try {
    await runWithGuild(gid, () => command.execute(interaction));
  } catch (err) {
    log('ERROR', `Command error: /${interaction.commandName}`, err);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'An error occurred while executing this command.', flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: 'An error occurred while executing this command.', flags: MessageFlags.Ephemeral });
    }
  }
}
