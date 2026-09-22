import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Interaction,
  MessageActionRowComponentBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { pulseEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';
import {
  MARRIAGE_CONSTS,
  acceptProposal,
  currentMarriage,
  declineProposal,
  divorce,
  getProposal,
  propose,
} from '../services/marriage.js';

export const data = new SlashCommandBuilder()
  .setName('marriage')
  .setDescription('Marriage system / Système de mariage')
  .addSubcommand(s => s.setName('propose').setDescription('Propose to a member / Faire ta demande')
    .addUserOption(o => o.setName('user').setDescription('Your beloved / Ta moitié').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Ring inscription (max 200 chars)').setRequired(false)))
  .addSubcommand(s => s.setName('status').setDescription('See who you are married to / Voir ton mariage'))
  .addSubcommand(s => s.setName('divorce').setDescription('End your marriage / Divorcer'));

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const fr = locale === 'fr';
  const sub = interaction.options.getSubcommand();

  if (sub === 'propose') {
    const target = interaction.options.getUser('user', true);
    const message = interaction.options.getString('message') ?? '';
    if (target.bot) {
      await interaction.reply({ embeds: [errorEmbed(fr ? "Tu ne peux pas épouser un bot." : "You can't marry a bot.")], flags: MessageFlags.Ephemeral });
      return;
    }
    const res = await propose(interaction.user.id, target.id, message);
    if (!res.ok || !res.proposalId) {
      const msg = res.error === 'self_propose' ? (fr ? "Impossible de t'épouser toi-même." : "You can't propose to yourself.")
        : res.error === 'already_married_proposer' ? (fr ? 'Tu es déjà marié·e.' : 'You are already married.')
        : res.error === 'already_married_target' ? (fr ? "L'autre personne est déjà mariée." : 'That person is already married.')
        : res.error === 'pending_proposal' ? (fr ? 'Une demande est déjà en attente entre vous.' : 'A proposal is already pending between you.')
        : (fr ? 'Demande impossible.' : 'Proposal failed.');
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      return;
    }

    const embed = pulseEmbed(fr ? '💍 Demande en mariage' : '💍 Marriage proposal').setDescription(
      (fr
        ? `<@${interaction.user.id}> demande <@${target.id}> en mariage 💗\n\n${message ? `_"${message}"_\n\n` : ''}` +
          `Anneau : **${MARRIAGE_CONSTS.RING_COST} PULSE** (remboursé si refus)`
        : `<@${interaction.user.id}> is proposing to <@${target.id}> 💗\n\n${message ? `_"${message}"_\n\n` : ''}` +
          `Ring: **${MARRIAGE_CONSTS.RING_COST} PULSE** (refunded on decline)`)
    );
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`marriage:accept:${res.proposalId}`).setLabel(fr ? 'Oui, je le veux' : 'Yes, I do').setEmoji('💍').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`marriage:decline:${res.proposalId}`).setLabel(fr ? 'Refuser' : 'Decline').setEmoji('🙅').setStyle(ButtonStyle.Danger),
    );
    await interaction.reply({ embeds: [embed], components: [row], allowedMentions: { users: [target.id] } });
    return;
  }

  if (sub === 'status') {
    const cur = await currentMarriage(interaction.user.id);
    if (!cur) {
      await interaction.reply({ embeds: [errorEmbed(fr ? 'Tu es célibataire.' : 'You are single.')], flags: MessageFlags.Ephemeral });
      return;
    }
    const days = Math.floor((Date.now() - new Date(cur.wedding_date).getTime()) / 86_400_000);
    await interaction.reply({
      embeds: [pulseEmbed(fr ? '💍 Mariage actif' : '💍 Active marriage').setDescription(
        (fr
          ? `Uni·e à <@${cur.partnerId}> depuis **${days} jour${days === 1 ? '' : 's'}** 💗`
          : `Bonded to <@${cur.partnerId}> for **${days} day${days === 1 ? '' : 's'}** 💗`))],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'divorce') {
    const res = await divorce(interaction.user.id);
    if (!res.ok) {
      const msg = res.error === 'not_married' ? (fr ? "Tu n'es pas marié·e." : 'You are not married.')
        : (fr ? 'Divorce impossible.' : 'Divorce failed.');
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      embeds: [successEmbed(fr
        ? `💔 Tu divorces de <@${res.partnerId}>. Frais : ${MARRIAGE_CONSTS.DIVORCE_FEE} PULSE.`
        : `💔 You divorced <@${res.partnerId}>. Fee: ${MARRIAGE_CONSTS.DIVORCE_FEE} PULSE.`)],
    });
    return;
  }
}

export async function handleMarriageInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('marriage:')) return;
  const locale = await getUserLocale(interaction.user.id);
  const fr = locale === 'fr';
  const [, kind, idStr] = interaction.customId.split(':');
  const id = Number(idStr);
  if (!Number.isFinite(id)) return;
  const p = await getProposal(id);
  if (!p || p.status !== 'pending') {
    await interaction.reply({ embeds: [errorEmbed(fr ? 'Demande introuvable ou déjà résolue.' : 'Proposal missing or resolved.')], flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.user.id !== p.target_id && interaction.user.id !== p.proposer_id) {
    await interaction.reply({ embeds: [errorEmbed(fr ? "Ce n'est pas ta demande." : 'Not your proposal.')], flags: MessageFlags.Ephemeral });
    return;
  }

  if (kind === 'accept') {
    if (interaction.user.id !== p.target_id) {
      await interaction.reply({ embeds: [errorEmbed(fr ? 'Seule la cible peut accepter.' : 'Only the target can accept.')], flags: MessageFlags.Ephemeral });
      return;
    }
    const res = await acceptProposal(id, interaction.user.id);
    if (!res.ok) {
      await interaction.reply({ embeds: [errorEmbed(res.error ?? 'error')], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.update({
      embeds: [successEmbed(fr
        ? `💗 <@${res.partnerId}> et <@${interaction.user.id}> sont maintenant mariés ! 🎉`
        : `💗 <@${res.partnerId}> and <@${interaction.user.id}> are now married! 🎉`)],
      components: [],
    });
    return;
  }
  if (kind === 'decline') {
    const res = await declineProposal(id, interaction.user.id);
    if (!res.ok) {
      await interaction.reply({ embeds: [errorEmbed(res.error ?? 'error')], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.update({
      embeds: [errorEmbed(fr
        ? `💔 Demande refusée par <@${interaction.user.id}>. Anneau remboursé.`
        : `💔 Proposal declined by <@${interaction.user.id}>. Ring refunded.`)],
      components: [],
    });
  }
}
