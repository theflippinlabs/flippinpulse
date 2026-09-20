import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageActionRowComponentBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { formatDuration, searchTrack } from '../services/music.js';
import { errorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('music')
  .setDescription('Find a song and share it with the community — Spotify / Apple Music / Deezer links')
  .addStringOption(o =>
    o.setName('query')
      .setDescription('Song title, artist, or any search terms')
      .setRequired(true),
  );

const NOVARYS_COLOR = 0xF5B62E;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const query = interaction.options.getString('query', true);
  await interaction.deferReply();

  const track = await searchTrack(query);
  if (!track) {
    await interaction.editReply({ embeds: [errorEmbed('No match found on any platform.')] });
    return;
  }

  const duration = formatDuration(track.duration_ms);
  const description =
    `**${track.artist}**` +
    (track.album ? `\n_${track.album}_` : '') +
    (duration ? `\n\n🕒 ${duration}` : '') +
    (Object.values(track.links).some(Boolean) ? '' : '\n\n_No streaming link available._');

  const embed = new EmbedBuilder()
    .setColor(NOVARYS_COLOR)
    .setTitle(`🎵 ${track.title}`)
    .setDescription(description)
    .setFooter({
      text: `Shared by ${interaction.user.username} · via Novarys jukebox`,
      iconURL: interaction.user.displayAvatarURL({ size: 64 }),
    })
    .setTimestamp();

  if (track.cover_url) embed.setThumbnail(track.cover_url);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();
  if (track.links.spotify) {
    row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Spotify').setEmoji('🎵').setURL(track.links.spotify));
  }
  if (track.links.apple) {
    row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Apple Music').setEmoji('🍎').setURL(track.links.apple));
  }
  if (track.links.deezer) {
    row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Deezer').setEmoji('🎶').setURL(track.links.deezer));
  }

  await interaction.editReply({
    embeds: [embed],
    components: row.components.length ? [row] : [],
    allowedMentions: { parse: [] },
  });
}

// Ephemeral hint if Spotify not configured — surfaced in a config-check
// but the command still works with Deezer + Apple even without Spotify.
export function musicConfigWarnings(): string[] {
  const w: string[] = [];
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    w.push('SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set — Spotify links will be missing. Add both in Railway env vars to enable Spotify search.');
  }
  return w;
}

export { musicConfigWarnings as _musicConfigWarnings };
