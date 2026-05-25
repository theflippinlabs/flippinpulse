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
import * as reactionrole from './reactionrole.js';
import * as giveaway from './giveaway.js';
import * as poll from './poll.js';
import * as slots from './slots.js';
import * as roulette from './roulette.js';
import * as blackjack from './blackjack.js';
import * as rps from './rps.js';
import * as wheel from './wheel.js';
import * as warn from './warn.js';
import * as warnings from './warnings.js';
import * as mute from './mute.js';
import * as unmute from './unmute.js';
import * as kick from './kick.js';
import * as ban from './ban.js';
import * as unban from './unban.js';
import * as clear from './clear.js';
import * as givepulse from './givepulse.js';
import * as removepulse from './removepulse.js';

export interface Command {
  data: SharedSlashCommand;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const commandList: Command[] = [
  profile, balance, leaderboard, shop, buy, missions, daily,
  crash, duel, quiz, treasure, typingrace,
  reactionrole, giveaway, poll,
  slots, roulette, blackjack, rps, wheel,
  warn, warnings, mute, unmute, kick, ban, unban, clear,
  givepulse, removepulse,
];

export const commands = new Map<string, Command>();
for (const cmd of commandList) {
  commands.set(cmd.data.name, cmd);
}

export const commandData = commandList.map(cmd => cmd.data.toJSON());
