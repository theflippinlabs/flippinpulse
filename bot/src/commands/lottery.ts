import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { buyTickets, getStatus, getLotteryConfig } from '../services/lottery.js';
import { recordChallengeMetric } from '../services/challenges.js';
import { pulseEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

export const data = new SlashCommandBuilder()
  .setName('lottery')
  .setDescription('PULSE lottery — buy tickets for the jackpot')
  .addSubcommand(s =>
    s.setName('buy').setDescription('Buy lottery tickets')
      .addIntegerOption(o => o.setName('tickets').setDescription('How many tickets').setMinValue(1).setRequired(true))
  )
  .addSubcommand(s => s.setName('status').setDescription('See the current jackpot and your tickets'));

function timeUntil(iso: string, en: boolean): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return en ? 'any moment now' : 'imminent';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';

  if (!getLotteryConfig().enabled) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'The lottery is currently disabled.' : 'La loterie est désactivée pour l\'instant.')], flags: MessageFlags.Ephemeral });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'buy') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const count = interaction.options.getInteger('tickets', true);
    const res = await buyTickets(interaction.user.id, count);
    if (!res.success) {
      await interaction.editReply({ embeds: [errorEmbed(res.error ?? (en ? 'Could not buy tickets.' : 'Impossible d\'acheter des tickets.'))] });
      return;
    }
    void recordChallengeMetric(interaction.client, interaction.user.id, interaction.user.username, 'lottery_tickets', count);
    await interaction.editReply({
      embeds: [successEmbed(en
        ? `🎟️ Bought **${count}** ticket${count === 1 ? '' : 's'}!\n\nYou now hold **${res.tickets}** ticket${res.tickets === 1 ? '' : 's'} this round.\n💰 Jackpot is now **${res.pot}** PULSE.\n⏳ Draw in ${timeUntil(res.drawAt!, true)}.`
        : `🎟️ **${count}** ticket${count === 1 ? '' : 's'} acheté${count === 1 ? '' : 's'} !\n\nTu détiens maintenant **${res.tickets}** ticket${res.tickets === 1 ? '' : 's'} sur ce tour.\n💰 La cagnotte est de **${res.pot}** PULSE.\n⏳ Tirage dans ${timeUntil(res.drawAt!, false)}.`
      )],
    });
    return;
  }

  await interaction.deferReply();
  const st = await getStatus(interaction.user.id);
  if (!st) {
    await interaction.editReply({ embeds: [errorEmbed(en ? 'No active lottery right now.' : 'Pas de loterie active pour l\'instant.')] });
    return;
  }
  const odds = st.totalTickets > 0 ? ((st.userTickets / st.totalTickets) * 100).toFixed(1) : '0';
  const embed = pulseEmbed(en ? '🎰 PULSE Lottery' : '🎰 Loterie PULSE')
    .setDescription(en
      ? `💰 **Jackpot:** ${st.pot} PULSE\n🎟️ **Ticket price:** ${st.ticketPrice} PULSE\n🎫 **Tickets in play:** ${st.totalTickets}\n⏳ **Draw in:** ${timeUntil(st.drawAt, true)}\n\n**Your tickets:** ${st.userTickets} (${odds}% chance)\n\nBuy in with \`/lottery buy\`.`
      : `💰 **Cagnotte :** ${st.pot} PULSE\n🎟️ **Prix / ticket :** ${st.ticketPrice} PULSE\n🎫 **Tickets en jeu :** ${st.totalTickets}\n⏳ **Tirage dans :** ${timeUntil(st.drawAt, false)}\n\n**Tes tickets :** ${st.userTickets} (${odds}% de chance)\n\nAchète avec \`/lottery buy\`.`
    );
  await interaction.editReply({ embeds: [embed] });
}
