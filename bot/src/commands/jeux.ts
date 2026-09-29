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

// Star of the room — the multi-player headliners live at the top so they
// never disappear at the bottom of a long embed.
const FLAGSHIP: GameEntry[] = [
  { name: 'poker',       emoji: '♠️', desc_fr: 'Poker Texas Hold\'em — table multijoueur en direct',       desc_en: 'Texas Hold\'em Poker — live multiplayer table' },
  { name: 'cards',       emoji: '🎴', desc_fr: 'Trading Cards — packs, duels, fusion',                    desc_en: 'Trading Cards — packs, duels, fuse' },
];

const CASINO: GameEntry[] = [
  { name: 'slots',       emoji: '🎰', desc_fr: 'Machine à sous — jackpot ×50',                            desc_en: 'Slot machine — up to ×50 jackpot' },
  { name: 'blackjack',   emoji: '🃏', desc_fr: 'Blackjack — face au croupier',                            desc_en: 'Blackjack — vs the dealer' },
  { name: 'roulette',    emoji: '🎡', desc_fr: 'Roulette européenne',                                     desc_en: 'European roulette' },
  { name: 'crash',       emoji: '💥', desc_fr: 'Crash — cash out avant l\'explosion',                    desc_en: 'Crash — cash out before it blows' },
  { name: 'wheel',       emoji: '🎯', desc_fr: 'Roue Gacha (mise) — jusqu\'à ×25',                       desc_en: 'Gacha wheel (bet) — up to ×25' },
  { name: 'higherlower', emoji: '🎲', desc_fr: 'Plus ou Moins — encaisse avant l\'erreur',              desc_en: 'Higher/Lower — cash out before you miss' },
];

const LOBBY: GameEntry[] = [
  { name: 'chicken',      emoji: '🐔', desc_fr: 'Chicken Race — cash out avant l\'envol',                desc_en: 'Chicken Race — cash out before takeoff' },
  { name: 'battleroyale', emoji: '🏆', desc_fr: 'Battle Royale — dernier debout rafle la cagnotte',      desc_en: 'Battle Royale — last standing takes the pot' },
  { name: 'diceroyale',   emoji: '🎲', desc_fr: 'Dé Royale — meilleur lancer gagne',                     desc_en: 'Dice Royale — highest roll wins' },
  { name: 'tournoi',      emoji: '🏟️', desc_fr: 'Tournois PvP à élimination',                            desc_en: 'Single-elim PvP tournaments' },
];

const PVP: GameEntry[] = [
  { name: 'duel',       emoji: '⚔️', desc_fr: 'Duel — défie un joueur (pile ou face)',   desc_en: 'Duel — challenge a player (coin flip)' },
  { name: 'rps',        emoji: '✊', desc_fr: 'Pierre-Feuille-Ciseaux 1v1',              desc_en: 'Rock-Paper-Scissors 1v1' },
  { name: 'typingrace', emoji: '⌨️', desc_fr: 'Course de frappe (jusqu\'à 6 joueurs)', desc_en: 'Typing race (up to 6 players)' },
];

const REWARDS: GameEntry[] = [
  { name: 'quiz',     emoji: '🧠', desc_fr: 'Quiz solo — culture générale',            desc_en: 'Trivia quiz — general knowledge' },
  { name: 'hunt',     emoji: '🗺️', desc_fr: 'Chasse au trésor — énigmes d\'un Lord', desc_en: 'Treasure hunt — riddles from a Lord' },
  { name: 'treasure', emoji: '💰', desc_fr: 'Coffres surprise (spawn aléatoire)',      desc_en: 'Surprise chests (random spawn)' },
  { name: 'lottery',  emoji: '🎫', desc_fr: 'Loterie serveur — jackpot en PULSE',     desc_en: 'Server lottery — PULSE jackpot' },
  { name: 'music',    emoji: '🎵', desc_fr: 'Partage une chanson (Spotify/Apple/Deezer)', desc_en: 'Share a song (Spotify/Apple/Deezer)' },
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
    renderSection(en ? '⭐ Star of the room' : '⭐ Star du salon', FLAGSHIP, ids, locale),
    '',
    renderSection(en ? '🎰 Solo casino (instant bet)' : '🎰 Casino solo (mise instantanée)', CASINO, ids, locale),
    '',
    renderSection(en ? '🏟️ Multiplayer (open lobby)' : '🏟️ Multijoueur (lobby ouvert)', LOBBY, ids, locale),
    '',
    renderSection(en ? '⚔️ 1v1 duels' : '⚔️ Duels 1v1', PVP, ids, locale),
    '',
    renderSection(en ? '🧠 Riddles & loot' : '🧠 Énigmes & butin', REWARDS, ids, locale),
    '',
    en ? '**🎁 Raffles** _(hosted by a Lord)_' : '**🎁 Tirages au sort** _(organisés par un Lord)_',
    en
      ? `${mention('giveaway', ids)} — hit **Enter** when an announcement drops. Only a Lord can start one.`
      : `${mention('giveaway', ids)} — clique sur **Entrer** quand une annonce s'affiche. Un Lord seul peut en lancer une.`,
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
