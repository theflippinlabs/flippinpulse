import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type MessageActionRowComponentBuilder } from 'discord.js';

// Action row displayed after a single-player bet game finishes.
// Includes Play Again (same bet), Double (2x bet) and back-to-hub.
export function buildPostGameRow(gameKey: string, bet: number): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`hub:again:${gameKey}:${bet}`).setLabel(`Rejouer (${bet})`).setEmoji('🔄').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`hub:double:${gameKey}:${bet}`).setLabel(`Doubler (${bet * 2})`).setEmoji('💰').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('hub:home').setLabel('Hub').setEmoji('🏠').setStyle(ButtonStyle.Secondary),
  );
}
