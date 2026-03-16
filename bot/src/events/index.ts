import { Client, Events } from 'discord.js';
import { handleMessageCreate } from './messageCreate.js';
import { handleMessageReactionAdd } from './messageReactionAdd.js';
import { handleVoiceStateUpdate } from './voiceStateUpdate.js';
import { handleGuildMemberAdd } from './guildMemberAdd.js';
import { handleInteractionCreate } from './interactionCreate.js';

export function registerEvents(client: Client): void {
  client.on(Events.MessageCreate, handleMessageCreate);
  client.on(Events.MessageReactionAdd, handleMessageReactionAdd);
  client.on(Events.VoiceStateUpdate, handleVoiceStateUpdate);
  client.on(Events.GuildMemberAdd, handleGuildMemberAdd);
  client.on(Events.InteractionCreate, handleInteractionCreate);
}
