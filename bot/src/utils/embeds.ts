import { EmbedBuilder } from 'discord.js';

const BRAND_COLOR = 0x38BDF8; // primary cyan

export function pulseEmbed(title: string) {
  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(title)
    .setTimestamp();
}

export function errorEmbed(message: string) {
  return new EmbedBuilder()
    .setColor(0xEF4444)
    .setTitle('Error')
    .setDescription(message)
    .setTimestamp();
}

export function successEmbed(message: string) {
  return new EmbedBuilder()
    .setColor(0x22C55E)
    .setDescription(message)
    .setTimestamp();
}
