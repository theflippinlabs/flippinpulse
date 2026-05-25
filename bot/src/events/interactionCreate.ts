import { ButtonInteraction, Interaction, MessageFlags } from 'discord.js';
import { commands } from '../commands/index.js';
import {
  GIVEAWAY_BUTTON_ID,
  addEntry,
  buildGiveawayEmbed,
  countEntries,
  getGiveawayByMessage,
} from '../services/giveaways.js';
import { handleLobbyButton } from '../services/lobby.js';
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
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('lobby_')) {
      try {
        await handleLobbyButton(interaction);
      } catch (err) {
        log('ERROR', 'Lobby button handler crashed', err);
      }
      return;
    }
    if (interaction.customId === GIVEAWAY_BUTTON_ID) {
      try {
        await handleGiveawayButton(interaction);
      } catch (err) {
        log('ERROR', 'Giveaway button handler crashed', err);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    log('ERROR', `Command error: /${interaction.commandName}`, err);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'An error occurred while executing this command.', flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: 'An error occurred while executing this command.', flags: MessageFlags.Ephemeral });
    }
  }
}
