import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { deleteBirthday, getBirthday, setBirthday } from '../services/birthdays.js';
import { pulseEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

const MONTH_LABELS = {
  fr: ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],
  en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
};

export const data = new SlashCommandBuilder()
  .setName('birthday')
  .setDescription('Manage your birthday / Gère ton anniversaire')
  .addSubcommand(s => s.setName('set').setDescription('Save your birthday / Enregistre ton anniversaire')
    .addIntegerOption(o => o.setName('day').setDescription('Day (1-31)').setMinValue(1).setMaxValue(31).setRequired(true))
    .addIntegerOption(o => o.setName('month').setDescription('Month (1-12)').setMinValue(1).setMaxValue(12).setRequired(true)))
  .addSubcommand(s => s.setName('view').setDescription('View your saved birthday / Voir la date enregistrée'))
  .addSubcommand(s => s.setName('remove').setDescription('Delete your birthday / Effacer ta date'));

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const fr = locale === 'fr';
  const sub = interaction.options.getSubcommand();

  if (sub === 'set') {
    const day = interaction.options.getInteger('day', true);
    const month = interaction.options.getInteger('month', true);
    const res = await setBirthday(interaction.user.id, month, day);
    if (!res.ok) {
      const msg = res.error === 'invalid_month' ? (fr ? 'Mois invalide.' : 'Invalid month.')
        : res.error === 'invalid_day' ? (fr ? 'Jour invalide pour ce mois.' : 'Invalid day for that month.')
        : (fr ? 'Sauvegarde impossible.' : 'Could not save.');
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      return;
    }
    const monthLabel = MONTH_LABELS[fr ? 'fr' : 'en'][month - 1];
    await interaction.reply({
      embeds: [successEmbed(fr
        ? `🎂 Anniversaire enregistré au **${day} ${monthLabel}**. Tu recevras **500 PULSE** ce jour-là.`
        : `🎂 Birthday saved to **${monthLabel} ${day}**. You'll get **500 PULSE** on that day.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'view') {
    const b = await getBirthday(interaction.user.id);
    if (!b) {
      await interaction.reply({ embeds: [errorEmbed(fr ? 'Aucune date enregistrée.' : 'No birthday saved yet.')], flags: MessageFlags.Ephemeral });
      return;
    }
    const monthLabel = MONTH_LABELS[fr ? 'fr' : 'en'][b.birth_month - 1];
    await interaction.reply({
      embeds: [pulseEmbed('🎂').setDescription(fr
        ? `Ton anniversaire : **${b.birth_day} ${monthLabel}**.`
        : `Your birthday: **${monthLabel} ${b.birth_day}**.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'remove') {
    await deleteBirthday(interaction.user.id);
    await interaction.reply({ embeds: [successEmbed(fr ? 'Date effacée.' : 'Birthday removed.')], flags: MessageFlags.Ephemeral });
  }
}
