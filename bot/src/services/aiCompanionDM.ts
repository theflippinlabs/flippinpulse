import { Message } from 'discord.js';
import { chatWithCompanion, getCompanion } from './aiCompanion.js';
import { getUserLocale } from '../i18n.js';
import { log } from '../utils/logger.js';

const dmCooldown = new Map<string, number>();
const DM_COOLDOWN_MS = 2_000;

export async function handleCompanionDM(message: Message): Promise<void> {
  if (message.author.bot || message.guild) return;
  const content = message.content.trim();
  if (!content) return;

  const now = Date.now();
  const last = dmCooldown.get(message.author.id) ?? 0;
  if (now - last < DM_COOLDOWN_MS) return;
  dmCooldown.set(message.author.id, now);

  try {
    if ('sendTyping' in message.channel) await message.channel.sendTyping().catch(() => null);
    const res = await chatWithCompanion(message.author.id, message.author.username, content);

    if (res.setupRequired) {
      const locale = await getUserLocale(message.author.id);
      const en = locale === 'en';
      await message.reply(en
        ? "You don't have a personal AI companion yet. Set one up with `/compagnon setup` on the server, then DM me again!"
        : "Tu n'as pas encore de compagnon IA personnel. Configure-en un avec `/compagnon setup` sur le serveur, puis reviens me DM !").catch(() => null);
      return;
    }
    if (!res.reply) return;

    const companion = await getCompanion(message.author.id);
    const prefix = companion ? `${companion.emoji} **${companion.name}** — ` : '';
    // Discord message length cap is 2000; leave room for the prefix.
    const body = res.reply.slice(0, 1900);
    await message.reply(`${prefix}${body}`).catch(err => log('ERROR', 'companion DM reply failed', err));
  } catch (err) {
    log('ERROR', 'companion DM handler crashed', err);
  }
}
