import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { pulseEmbed } from '../utils/embeds.js';

// Cache the fetched command IDs so we render slash-command mentions
// (Discord auto-linkifies </name:id> into a clickable chip).
let commandIdCache: Map<string, string> | null = null;

async function loadCommandIds(interaction: ChatInputCommandInteraction): Promise<Map<string, string>> {
  if (commandIdCache && commandIdCache.size) return commandIdCache;
  const cache = new Map<string, string>();
  const guildCmds = await interaction.guild?.commands.fetch().catch(() => null);
  if (guildCmds) for (const [id, cmd] of guildCmds) cache.set(cmd.name, id);
  if (!cache.size) {
    const globalCmds = await interaction.client.application?.commands.fetch().catch(() => null);
    if (globalCmds) for (const [id, cmd] of globalCmds) cache.set(cmd.name, id);
  }
  commandIdCache = cache;
  return cache;
}

function mention(name: string, ids: Map<string, string>): string {
  const id = ids.get(name);
  return id ? `</${name}:${id}>` : `\`/${name}\``;
}

interface GameEntry { name: string; emoji: string; desc: string; }

const SOLO: GameEntry[] = [
  { name: 'higherlower', emoji: '🎲', desc: 'Plus ou Moins — encaisse avant de te tromper' },
  { name: 'crash',       emoji: '💥', desc: 'Cash out avant que le multiplicateur s\'effondre' },
  { name: 'slots',       emoji: '🎰', desc: 'Machine à sous — 7s alignés = jackpot' },
  { name: 'roulette',    emoji: '🎡', desc: 'Roulette européenne — rouge, noir, numéro' },
  { name: 'blackjack',   emoji: '🃏', desc: 'Face au croupier — vise 21 sans dépasser' },
  { name: 'wheel',       emoji: '🎡', desc: 'Roue Gacha — jusqu\'à ×25' },
  { name: 'quiz',        emoji: '🧠', desc: 'Quiz solo — réponds bien pour gagner des PULSE' },
];

const PVP: GameEntry[] = [
  { name: 'duel',       emoji: '⚔️', desc: 'Défie un joueur (coinflip ou dés)' },
  { name: 'rps',        emoji: '✊', desc: 'Pierre-Feuille-Ciseaux 1v1' },
  { name: 'typingrace', emoji: '⌨️', desc: 'Course de frappe — le plus rapide gagne' },
];

const MULTI: GameEntry[] = [
  { name: 'battleroyale', emoji: '🏆', desc: 'Battle Royale — le dernier survivant rafle la cagnotte' },
  { name: 'diceroyale',   emoji: '🎲', desc: 'Dé Royale — le plus haut score gagne' },
];

const OTHER: GameEntry[] = [
  { name: 'treasure', emoji: '💰', desc: 'Chasse au trésor — ouvre des coffres' },
  { name: 'lottery',  emoji: '🎫', desc: 'Loterie — achète des tickets pour le jackpot' },
];

function renderSection(title: string, entries: GameEntry[], ids: Map<string, string>): string {
  return `**${title}**\n` + entries
    .map(g => `${g.emoji} ${mention(g.name, ids)} — ${g.desc}`)
    .join('\n');
}

export const data = new SlashCommandBuilder()
  .setName('jeux')
  .setDescription('Ouvre la salle des jeux — tous les jeux Novarys d\'un coup');

export async function execute(interaction: ChatInputCommandInteraction) {
  const ids = await loadCommandIds(interaction);

  const description = [
    'Tape sur un jeu pour lancer sa commande — ajoute ta mise et envoie ! 🎮',
    '',
    renderSection('🎯 Solo', SOLO, ids),
    '',
    renderSection('⚔️ 1v1 / Duel', PVP, ids),
    '',
    renderSection('🏟️ Multijoueur (lobby)', MULTI, ids),
    '',
    renderSection('🎁 Autres', OTHER, ids),
    '',
    `💡 Astuce : ${mention('balance', ids)} pour ton solde · ${mention('leaderboard', ids)} pour le classement.`,
  ].join('\n');

  await interaction.reply({
    embeds: [pulseEmbed('🎮 NOVARYS — Salle des jeux').setDescription(description)],
    flags: MessageFlags.Ephemeral,
  });
}
