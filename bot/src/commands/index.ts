import { ChatInputCommandInteraction, SharedSlashCommand } from 'discord.js';
import * as profile from './profile.js';
import * as balance from './balance.js';
import * as leaderboard from './leaderboard.js';
import * as shop from './shop.js';
import * as buy from './buy.js';
import * as missions from './missions.js';
import * as daily from './daily.js';

export interface Command {
  data: SharedSlashCommand;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const commandList: Command[] = [profile, balance, leaderboard, shop, buy, missions, daily];

export const commands = new Map<string, Command>();
for (const cmd of commandList) {
  commands.set(cmd.data.name, cmd);
}

export const commandData = commandList.map(cmd => cmd.data.toJSON());
