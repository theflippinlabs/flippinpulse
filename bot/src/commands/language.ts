import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { getUserLocale, setUserLocale, t } from '../i18n.js';

export const data = new SlashCommandBuilder()
  .setName('language')
  .setDescription('Switch bot language / Changer la langue du bot')
  .addStringOption(o =>
    o.setName('lang')
      .setDescription('fr = français · en = English')
      .setRequired(true)
      .addChoices(
        { name: '🇫🇷 Français', value: 'fr' },
        { name: '🇬🇧 English',  value: 'en' },
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const raw = interaction.options.getString('lang', true);
  const next = raw === 'en' ? 'en' : 'fr';
  await setUserLocale(interaction.user.id, next);
  const message = next === 'en' ? t('language', 'set_en', 'en') : t('language', 'set_fr', 'fr');
  await interaction.reply({ content: message, ephemeral: true });

  // Best-effort: nudge the current locale cache so the next command hit is
  // immediately in the new language even without waiting for cache expiry.
  await getUserLocale(interaction.user.id);
}
