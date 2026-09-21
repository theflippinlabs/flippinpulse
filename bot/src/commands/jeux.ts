import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { pulseEmbed } from '../utils/embeds.js';
import { getUserLocale, type Locale } from '../i18n.js';

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

interface GameEntry { name: string; emoji: string; desc_fr: string; desc_en: string; }

const SOLO: GameEntry[] = [
  { name: 'higherlower', emoji: '🎲', desc_fr: 'Plus ou Moins — encaisse avant de te tromper',            desc_en: 'Higher/Lower — cash out before you miss' },
  { name: 'crash',       emoji: '💥', desc_fr: 'Cash out avant que le multiplicateur s\'effondre',        desc_en: 'Cash out before the multiplier crashes' },
  { name: 'slots',       emoji: '🎰', desc_fr: 'Machine à sous — 7s alignés = jackpot',                   desc_en: 'Slot machine — three 7s = jackpot' },
  { name: 'roulette',    emoji: '🎡', desc_fr: 'Roulette européenne — rouge, noir, numéro',               desc_en: 'European roulette — red, black, number' },
  { name: 'blackjack',   emoji: '🃏', desc_fr: 'Face au croupier — vise 21 sans dépasser',                desc_en: 'Beat the dealer — aim for 21 without busting' },
  { name: 'wheel',       emoji: '🎡', desc_fr: 'Roue Gacha — jusqu\'à ×25',                              desc_en: 'Gacha wheel — up to ×25' },
  { name: 'quiz',        emoji: '🧠', desc_fr: 'Quiz solo — réponds bien pour gagner des PULSE',          desc_en: 'Solo quiz — answer well to earn PULSE' },
];

const PVP: GameEntry[] = [
  { name: 'duel',       emoji: '⚔️', desc_fr: 'Défie un joueur (coinflip ou dés)',        desc_en: 'Challenge a player (coin flip or dice)' },
  { name: 'rps',        emoji: '✊', desc_fr: 'Pierre-Feuille-Ciseaux 1v1',               desc_en: 'Rock-Paper-Scissors 1v1' },
  { name: 'typingrace', emoji: '⌨️', desc_fr: 'Course de frappe — le plus rapide gagne', desc_en: 'Typing race — fastest wins' },
];

const MULTI: GameEntry[] = [
  { name: 'chicken',      emoji: '🐔', desc_fr: 'Chicken Race — cash out avant que la poule s\'envole !',      desc_en: 'Chicken Race — cash out before the chicken flies!' },
  { name: 'battleroyale', emoji: '🏆', desc_fr: 'Battle Royale — le dernier survivant rafle la cagnotte',      desc_en: 'Battle Royale — last one standing takes the pot' },
  { name: 'diceroyale',   emoji: '🎲', desc_fr: 'Dé Royale — le plus haut score gagne',                        desc_en: 'Dice Royale — highest score wins' },
];

const OTHER: GameEntry[] = [
  { name: 'treasure', emoji: '💰', desc_fr: 'Chasse au trésor — ouvre des coffres',                    desc_en: 'Treasure hunt — open chests' },
  { name: 'lottery',  emoji: '🎫', desc_fr: 'Loterie — achète des tickets pour le jackpot',            desc_en: 'Lottery — buy tickets for the jackpot' },
  { name: 'music',    emoji: '🎵', desc_fr: 'Partage une chanson — Spotify / Apple Music / Deezer',   desc_en: 'Share a song — Spotify / Apple Music / Deezer' },
];

function renderSection(title: string, entries: GameEntry[], ids: Map<string, string>, locale: Locale): string {
  return `**${title}**\n` + entries
    .map(g => `${g.emoji} ${mention(g.name, ids)} — ${locale === 'en' ? g.desc_en : g.desc_fr}`)
    .join('\n');
}

export const data = new SlashCommandBuilder()
  .setName('jeux')
  .setDescription('Open the games room — every game in one place');

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';
  const ids = await loadCommandIds(interaction);

  const description = [
    en ? 'Tap a game to run its command — add your bet and send! 🎮'
       : 'Tape sur un jeu pour lancer sa commande — ajoute ta mise et envoie ! 🎮',
    '',
    renderSection(en ? '🎯 Solo' : '🎯 Solo', SOLO, ids, locale),
    '',
    renderSection(en ? '⚔️ 1v1 / Duel' : '⚔️ 1v1 / Duel', PVP, ids, locale),
    '',
    renderSection(en ? '🏟️ Multiplayer (lobby)' : '🏟️ Multijoueur (lobby)', MULTI, ids, locale),
    '',
    renderSection(en ? '🎁 Other' : '🎁 Autres', OTHER, ids, locale),
    '',
    en
      ? `💡 Tip: ${mention('balance', ids)} for your balance · ${mention('leaderboard', ids)} for the ranking.`
      : `💡 Astuce : ${mention('balance', ids)} pour ton solde · ${mention('leaderboard', ids)} pour le classement.`,
  ].join('\n');

  await interaction.reply({
    embeds: [pulseEmbed(en ? '🎮 Games room' : '🎮 Salle des jeux').setDescription(description)],
    flags: MessageFlags.Ephemeral,
  });
}
