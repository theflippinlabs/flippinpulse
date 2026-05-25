import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { buyTickets, getStatus, getLotteryConfig } from '../services/lottery.js';
import { recordChallengeMetric } from '../services/challenges.js';
import { pulseEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('lottery')
  .setDescription('PULSE lottery — buy tickets for the jackpot')
  .addSubcommand(s =>
    s.setName('buy').setDescription('Buy lottery tickets')
      .addIntegerOption(o => o.setName('tickets').setDescription('How many tickets').setMinValue(1).setRequired(true))
  )
  .addSubcommand(s => s.setName('status').setDescription('See the current jackpot and your tickets'));

function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'any moment now';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!getLotteryConfig().enabled) {
    await interaction.reply({ embeds: [errorEmbed('The lottery is currently disabled.')], flags: MessageFlags.Ephemeral });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'buy') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const count = interaction.options.getInteger('tickets', true);
    const res = await buyTickets(interaction.user.id, count);
    if (!res.success) {
      await interaction.editReply({ embeds: [errorEmbed(res.error ?? 'Could not buy tickets.')] });
      return;
    }
    void recordChallengeMetric(interaction.client, interaction.user.id, interaction.user.username, 'lottery_tickets', count);
    await interaction.editReply({
      embeds: [successEmbed(
        `🎟️ Bought **${count}** ticket${count === 1 ? '' : 's'}!\n\n` +
        `You now hold **${res.tickets}** ticket${res.tickets === 1 ? '' : 's'} this round.\n` +
        `💰 Jackpot is now **${res.pot}** PULSE.\n` +
        `⏳ Draw in ${timeUntil(res.drawAt!)}.`
      )],
    });
    return;
  }

  // status
  await interaction.deferReply();
  const st = await getStatus(interaction.user.id);
  if (!st) {
    await interaction.editReply({ embeds: [errorEmbed('No active lottery right now.')] });
    return;
  }
  const odds = st.totalTickets > 0 ? ((st.userTickets / st.totalTickets) * 100).toFixed(1) : '0';
  const embed = pulseEmbed('🎰 PULSE Lottery')
    .setDescription(
      `💰 **Jackpot:** ${st.pot} PULSE\n` +
      `🎟️ **Ticket price:** ${st.ticketPrice} PULSE\n` +
      `🎫 **Tickets in play:** ${st.totalTickets}\n` +
      `⏳ **Draw in:** ${timeUntil(st.drawAt)}\n\n` +
      `**Your tickets:** ${st.userTickets} (${odds}% chance)\n\n` +
      `Buy in with \`/lottery buy\`.`
    );
  await interaction.editReply({ embeds: [embed] });
}
