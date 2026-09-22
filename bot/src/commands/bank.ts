import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { pulseEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';
import {
  acceptLoan,
  bankStatus,
  declineLoan,
  deposit,
  myLoans,
  offerLoan,
  repayLoan,
  withdraw,
} from '../services/bank.js';

const fmt = (n: number) => n.toLocaleString('en-US');

export const data = new SlashCommandBuilder()
  .setName('bank')
  .setDescription('Bank + loans / Banque + prêts')
  .addSubcommand(s => s.setName('deposit').setDescription('Put PULSE in savings / Déposer')
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setMinValue(1).setRequired(true)))
  .addSubcommand(s => s.setName('withdraw').setDescription('Take PULSE out / Retirer')
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setMinValue(1).setRequired(true)))
  .addSubcommand(s => s.setName('status').setDescription('View savings / Voir tes économies'))
  .addSubcommand(s => s.setName('loan').setDescription('Offer a loan / Proposer un prêt')
    .addUserOption(o => o.setName('borrower').setDescription('Borrower / Emprunteur').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount 1-100000').setMinValue(1).setMaxValue(100_000).setRequired(true))
    .addIntegerOption(o => o.setName('days').setDescription('Duration 1-30 days').setMinValue(1).setMaxValue(30).setRequired(true)))
  .addSubcommand(s => s.setName('accept').setDescription('Accept a loan offer / Accepter un prêt')
    .addIntegerOption(o => o.setName('id').setDescription('Loan id').setRequired(true)))
  .addSubcommand(s => s.setName('decline').setDescription('Decline a loan / Refuser un prêt')
    .addIntegerOption(o => o.setName('id').setDescription('Loan id').setRequired(true)))
  .addSubcommand(s => s.setName('repay').setDescription('Repay an active loan / Rembourser')
    .addIntegerOption(o => o.setName('id').setDescription('Loan id').setRequired(true)))
  .addSubcommand(s => s.setName('loans').setDescription('List your pending/active loans / Lister tes prêts'));

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const fr = locale === 'fr';
  const sub = interaction.options.getSubcommand();

  if (sub === 'deposit') {
    const amount = interaction.options.getInteger('amount', true);
    const res = await deposit(interaction.user.id, amount);
    if (!res.ok) { await interaction.reply({ embeds: [errorEmbed(res.error === 'insufficient_pulse' ? (fr ? 'PULSE insuffisant.' : 'Not enough PULSE.') : (res.error ?? 'error'))], flags: MessageFlags.Ephemeral }); return; }
    await interaction.reply({ embeds: [successEmbed(fr ? `💰 **${fmt(amount)} PULSE** déposé. Épargne : **${fmt(res.savings!)}** PULSE.` : `💰 **${fmt(amount)} PULSE** deposited. Savings: **${fmt(res.savings!)}** PULSE.`)], flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'withdraw') {
    const amount = interaction.options.getInteger('amount', true);
    const res = await withdraw(interaction.user.id, amount);
    if (!res.ok) {
      const msg = res.error === 'insufficient_savings' ? (fr ? 'Économies insuffisantes.' : 'Not enough in savings.') : (res.error ?? 'error');
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ embeds: [successEmbed(fr ? `🏦 Retrait de **${fmt(amount)} PULSE**. Épargne restante : **${fmt(res.savings!)}** PULSE.` : `🏦 Withdrew **${fmt(amount)} PULSE**. Remaining: **${fmt(res.savings!)}** PULSE.`)], flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'status') {
    const s = await bankStatus(interaction.user.id);
    await interaction.reply({
      embeds: [pulseEmbed('🏦 Banque').setDescription(fr
        ? `**Épargne :** ${fmt(s.savings)} PULSE\n**Taux :** ${(s.weekly_rate * 100).toFixed(1)}% / semaine\n**Dernier intérêt :** ${new Date(s.last_interest_at).toLocaleDateString('fr-FR')}\n\n_Les intérêts sont crédités automatiquement chaque semaine._`
        : `**Savings:** ${fmt(s.savings)} PULSE\n**Rate:** ${(s.weekly_rate * 100).toFixed(1)}% / week\n**Last interest:** ${new Date(s.last_interest_at).toLocaleDateString('en-US')}\n\n_Interest is credited automatically each week._`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'loan') {
    const borrower = interaction.options.getUser('borrower', true);
    const amount = interaction.options.getInteger('amount', true);
    const days = interaction.options.getInteger('days', true);
    if (borrower.bot) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Impossible de prêter à un bot.' : "Can't lend to a bot.")], flags: MessageFlags.Ephemeral }); return; }
    const res = await offerLoan(interaction.user.id, borrower.id, amount, days);
    if (!res.ok || !res.loanId) {
      const msg = res.error === 'self_loan' ? (fr ? 'Impossible de te prêter à toi-même.' : "Can't loan to yourself.")
        : res.error === 'bad_amount' ? (fr ? 'Montant hors plage.' : 'Bad amount.')
        : res.error === 'bad_duration' ? (fr ? 'Durée hors plage.' : 'Bad duration.')
        : (fr ? 'Prêt impossible.' : 'Loan failed.');
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      return;
    }
    const dueAt = new Date(Date.now() + days * 86_400_000).toLocaleDateString(fr ? 'fr-FR' : 'en-US');
    const owed = Math.ceil(amount * 1.05);
    await interaction.reply({
      embeds: [pulseEmbed(fr ? '🏦 Offre de prêt' : '🏦 Loan offer').setDescription(fr
        ? `<@${borrower.id}>, <@${interaction.user.id}> te propose un prêt de **${fmt(amount)} PULSE**.\n\nÀ rembourser **${fmt(owed)} PULSE** avant le **${dueAt}** (5% d'intérêt).\n\nAccepte avec \`/bank accept id:${res.loanId}\` · Refuse avec \`/bank decline id:${res.loanId}\``
        : `<@${borrower.id}>, <@${interaction.user.id}> is offering you a **${fmt(amount)} PULSE** loan.\n\nRepay **${fmt(owed)} PULSE** by **${dueAt}** (5% interest).\n\nAccept: \`/bank accept id:${res.loanId}\` · Decline: \`/bank decline id:${res.loanId}\``)],
      allowedMentions: { users: [borrower.id] },
    });
    return;
  }

  if (sub === 'accept') {
    const id = interaction.options.getInteger('id', true);
    const res = await acceptLoan(id, interaction.user.id);
    if (!res.ok || !res.loan) { await interaction.reply({ embeds: [errorEmbed(res.error ?? 'error')], flags: MessageFlags.Ephemeral }); return; }
    await interaction.reply({ embeds: [successEmbed(fr ? `✅ Prêt #${id} accepté. +${fmt(res.loan.principal)} PULSE crédités. À rembourser avant le ${new Date(res.loan.due_at).toLocaleDateString('fr-FR')}.` : `✅ Loan #${id} accepted. +${fmt(res.loan.principal)} PULSE credited. Repay by ${new Date(res.loan.due_at).toLocaleDateString('en-US')}.`)] });
    return;
  }

  if (sub === 'decline') {
    const id = interaction.options.getInteger('id', true);
    const res = await declineLoan(id, interaction.user.id);
    if (!res.ok) { await interaction.reply({ embeds: [errorEmbed(res.error ?? 'error')], flags: MessageFlags.Ephemeral }); return; }
    await interaction.reply({ embeds: [successEmbed(fr ? `Prêt #${id} refusé. Prêteur remboursé.` : `Loan #${id} declined. Lender refunded.`)] });
    return;
  }

  if (sub === 'repay') {
    const id = interaction.options.getInteger('id', true);
    const res = await repayLoan(id, interaction.user.id);
    if (!res.ok) {
      const msg = res.error === 'not_borrower' ? (fr ? "Tu n'es pas l'emprunteur." : "You're not the borrower.")
        : res.error === 'not_active' ? (fr ? "Ce prêt n'est pas actif." : 'Loan is not active.')
        : res.error === 'insufficient_pulse' ? (fr ? 'PULSE insuffisant.' : 'Not enough PULSE.')
        : (res.error ?? 'error');
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ embeds: [successEmbed(fr ? `💸 Prêt #${id} remboursé — ${fmt(res.repaid!)} PULSE.` : `💸 Loan #${id} repaid — ${fmt(res.repaid!)} PULSE.`)], flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'loans') {
    const { asBorrower, asLender } = await myLoans(interaction.user.id);
    const asBorrowerLines = asBorrower.map(l => `• #${l.id} — de <@${l.lender_id}> · ${fmt(l.principal)} PULSE · échéance ${new Date(l.due_at).toLocaleDateString(fr ? 'fr-FR' : 'en-US')} · **${l.status}**`).join('\n');
    const asLenderLines = asLender.map(l => `• #${l.id} — à <@${l.borrower_id}> · ${fmt(l.principal)} PULSE · échéance ${new Date(l.due_at).toLocaleDateString(fr ? 'fr-FR' : 'en-US')} · **${l.status}**`).join('\n');
    await interaction.reply({
      embeds: [pulseEmbed(fr ? '🏦 Tes prêts' : '🏦 Your loans').setDescription(
        (fr
          ? `**Emprunts :**\n${asBorrowerLines || '_Aucun_'}\n\n**Prêts :**\n${asLenderLines || '_Aucun_'}`
          : `**Borrows:**\n${asBorrowerLines || '_None_'}\n\n**Lends:**\n${asLenderLines || '_None_'}`))],
      flags: MessageFlags.Ephemeral,
    });
  }
}
