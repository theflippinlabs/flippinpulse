import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { adminData, adminExecute } from './saga.js';

export const data: SlashCommandBuilder = adminData as SlashCommandBuilder;
export const execute = adminExecute;

// Re-export to keep TypeScript strict about unused imports.
void ChatInputCommandInteraction; void MessageFlags; void PermissionFlagsBits;
