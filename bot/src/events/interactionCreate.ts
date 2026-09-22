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
import { handlePanelInteraction } from '../commands/panel.js';
import { handleHubInteraction } from '../commands/hub.js';
import { handleTournamentButton } from '../commands/tournoi.js';
import { handleCosmeticsInteraction } from '../commands/cosmetics.js';
import { handleChickenButton } from '../services/chickenRace.js';
import { handleAutomodButton } from '../commands/automod.js';
import { handleChallengeInteraction } from '../services/challenges.js';
import { handlePokerInteraction } from '../commands/poker.js';
import { handleBattlePassInteraction } from '../commands/battlepass.js';
import { handlePetInteraction } from '../commands/pet.js';
import { seedLocaleFromDiscord } from '../i18n.js';
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
  // Prime each member's Novarys locale from their Discord client locale on
  // first contact. Fire-and-forget — the seed only writes when we don't
  // already have one on file, so this stays a no-op after the first time.
  if ('user' in interaction && interaction.user) {
    void seedLocaleFromDiscord(interaction.user.id, interaction.locale ?? null);
  }

  if (
    (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isChannelSelectMenu() || interaction.isUserSelectMenu() || interaction.isModalSubmit())
    && interaction.customId.startsWith('panel:')
  ) {
    try {
      await handlePanelInteraction(interaction);
    } catch (err) {
      log('ERROR', 'Panel interaction handler crashed', err);
    }
    return;
  }

  if (
    (interaction.isButton() || interaction.isModalSubmit())
    && interaction.customId.startsWith('challenge:')
  ) {
    try {
      await handleChallengeInteraction(interaction);
    } catch (err) {
      log('ERROR', 'Challenge interaction handler crashed', err);
    }
    return;
  }

  if (
    (interaction.isButton() || interaction.isModalSubmit())
    && interaction.customId.startsWith('poker:')
  ) {
    try {
      await handlePokerInteraction(interaction);
    } catch (err) {
      log('ERROR', 'Poker interaction handler crashed', err);
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('bp:')) {
    try {
      await handleBattlePassInteraction(interaction);
    } catch (err) {
      log('ERROR', 'Battle Pass interaction handler crashed', err);
    }
    return;
  }

  if (interaction.isButton() && (interaction.customId.startsWith('pet:') || interaction.customId.startsWith('petpvp:'))) {
    try {
      await handlePetInteraction(interaction);
    } catch (err) {
      log('ERROR', 'Pet interaction handler crashed', err);
    }
    return;
  }

  if ((interaction.isButton() || interaction.isModalSubmit()) && interaction.customId.startsWith('hub:')) {
    try {
      await handleHubInteraction(interaction);
    } catch (err) {
      log('ERROR', 'Hub interaction handler crashed', err);
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('tour:')) {
    try {
      await handleTournamentButton(interaction);
    } catch (err) {
      log('ERROR', 'Tournament button handler crashed', err);
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('chicken:')) {
    try {
      await handleChickenButton(interaction);
    } catch (err) {
      log('ERROR', 'Chicken race button handler crashed', err);
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('automod:')) {
    try {
      await handleAutomodButton(interaction);
    } catch (err) {
      log('ERROR', 'Automod button handler crashed', err);
    }
    return;
  }

  if ((interaction.isButton() || interaction.isModalSubmit()) && interaction.customId.startsWith('cos:')) {
    try {
      await handleCosmeticsInteraction(interaction);
    } catch (err) {
      log('ERROR', 'Cosmetics interaction handler crashed', err);
    }
    return;
  }

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
