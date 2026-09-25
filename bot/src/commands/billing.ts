import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { supabase } from '../supabase.js';
import { pulseEmbed, errorEmbed } from '../utils/embeds.js';
import { config } from '../config.js';

// Lord-facing plan viewer. Deep-links the caller to /dashboard/billing so
// they upgrade / cancel there — no card handling ever happens in Discord.
export const data = new SlashCommandBuilder()
  .setName('billing')
  .setDescription('Admin: view or manage this server\'s Novarys subscription')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter — €29 / mo',
  pro: 'Pro — €79 / mo',
  enterprise: 'Enterprise — Custom',
};

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ embeds: [errorEmbed('Réservé aux admins.')], flags: MessageFlags.Ephemeral });
    return;
  }
  const guildId = interaction.guildId ?? config.GUILD_ID;
  const { data } = await supabase.from('subscriptions').select('*').eq('guild_id', guildId).maybeSingle();
  const plan = (data?.plan as string) ?? 'free';
  const status = (data?.status as string) ?? 'active';
  const cpe = (data?.current_period_end as string | null) ?? null;
  const cancelAtEnd = Boolean(data?.cancel_at_period_end);

  const dashboardUrl = process.env.DASHBOARD_URL ?? 'https://dashboard-legacy-d92f468c.vercel.app';
  const link = `${dashboardUrl.replace(/\/$/, '')}/dashboard/billing`;

  const desc = [
    `📦 **Plan** : ${PLAN_LABELS[plan] ?? plan}`,
    `🟢 **Statut** : ${status}`,
    cpe ? `📅 **Renouvellement** : ${new Date(cpe).toLocaleDateString('fr-FR')}${cancelAtEnd ? ' _(annulation programmée)_' : ''}` : null,
    '',
    `🔗 **Gérer** : ${link}`,
    '_(carte, changement de plan, annulation)_',
  ].filter(Boolean).join('\n');

  await interaction.reply({
    embeds: [pulseEmbed('💳 Billing').setDescription(desc)],
    flags: MessageFlags.Ephemeral,
  });
}
