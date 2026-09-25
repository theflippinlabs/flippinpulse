import { EmbedBuilder, Guild } from 'discord.js';
import { log } from '../utils/logger.js';

/**
 * First-touch onboarding when the bot joins a new Discord server.
 *
 * The bot is meant to run through /setup by the server owner — this
 * event fires the moment the bot lands so the owner sees a friendly
 * welcome AND a clear next step before they wander off.
 *
 * Flow:
 *   1. DM the guild owner with a welcome embed + /setup instructions.
 *   2. If DMs are closed, fall back to posting in the system channel
 *      (the small "member joined" channel most servers keep), tagging
 *      the owner so they get a mention notification.
 *   3. Always log so a Lord's ops dashboard can spot new installs.
 */
export async function handleGuildCreate(guild: Guild): Promise<void> {
  log('INFO', `Bot joined guild ${guild.name} (${guild.id}) — ${guild.memberCount} members`);

  const owner = await guild.fetchOwner().catch(() => null);

  const embed = new EmbedBuilder()
    .setColor(0xF5B62E)
    .setTitle('🎉 Merci d\'avoir ajouté Novarys')
    .setDescription(
      `Salut ${owner ? `<@${owner.id}>` : ''} ! Je suis Novus — la couche communautaire IA de **${guild.name}**.\n\n` +
      '**Prochaine étape (2 minutes) :**\n' +
      '➡️ Lance `/setup` depuis n\'importe quel salon.\n' +
      'Ça t\'ouvre un assistant qui configure :\n' +
      '• 📢 Salon d\'annonces / de bienvenue / de mod-log\n' +
      '• 🎥 Salon d\'alertes stream + rôle streamer\n' +
      '• 📅 Salon des rappels calendrier\n' +
      '• 💰 Réglages économie (PULSE par activité)\n' +
      '• 🎛️ Modules on/off (welcome, rankup, automod, décroissance, etc.)\n\n' +
      '**Découvre en 30 s :**\n' +
      '• `/profile` — ton solde et ton rang\n' +
      '• `/shop` — la boutique communautaire\n' +
      '• `/jeux` — les 13 jeux natifs\n' +
      '• `/hub` — le menu principal pour les membres\n\n' +
      '**Web Command Deck :** https://dashboard-legacy-d92f468c.vercel.app/app\n' +
      '_(Tous les membres peuvent s\'y connecter avec leur Discord.)_'
    )
    .setFooter({ text: 'Ce message est envoyé une seule fois, à ton arrivée.' });

  // 1. Try DM to the owner first — most friendly.
  let dmDelivered = false;
  if (owner) {
    try {
      const dm = await owner.createDM();
      await dm.send({ embeds: [embed] });
      dmDelivered = true;
    } catch (err) {
      log('WARN', `Could not DM owner of ${guild.id}`, err);
    }
  }

  // 2. Fall back to the system channel with an @mention so the owner
  //    still sees the message even if DMs are closed.
  if (!dmDelivered) {
    const channel = guild.systemChannel;
    if (channel?.isSendable()) {
      await channel.send({
        content: owner ? `<@${owner.id}>` : undefined,
        embeds: [embed],
        allowedMentions: owner ? { users: [owner.id] } : undefined,
      }).catch(err => log('WARN', `Could not post welcome in system channel of ${guild.id}`, err));
    }
  }
}
