import { ChatInputCommandInteraction, SharedSlashCommand } from 'discord.js';
import * as profile from './profile.js';
import * as balance from './balance.js';
import * as leaderboard from './leaderboard.js';
import * as shop from './shop.js';
import * as buy from './buy.js';
import * as missions from './missions.js';
import * as daily from './daily.js';
import * as crash from './crash.js';
import * as duel from './duel.js';
import * as quiz from './quiz.js';
import * as treasure from './treasure.js';
import * as typingrace from './typingrace.js';

export interface Command {
  data: SharedSlashCommand;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const commandList: Command[] = [
  profile, balance, leaderboard, shop, buy, missions, daily,
  crash, duel, quiz, treasure, typingrace,
];

export const commands = new Map<string, Command>();
for (const cmd of commandList) {
  commands.set(cmd.data.name, cmd);
}

export const commandData = commandList.map(cmd => cmd.data.toJSON());
