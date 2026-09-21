import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  ChatInputCommandInteraction,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { pulseEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';
import { isGameEnabled, getGameConfig } from '../services/games.js';
import { log } from '../utils/logger.js';
import {
  attachListener,
  cardStr,
  createGame,
  currentActor,
  endGame,
  getGame,
  getGameByChannel,
  joinGame,
  leaveGame,
  playerAction,
  startGame,
  type Card,
  type Game,
  type ShowdownResult,
} from '../services/poker.js';

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

const dmedHoleCards = new Set<string>(); // gameId:handNumber:discordId

export const data = new SlashCommandBuilder()
  .setName('poker')
  .setDescription('Texas Hold\'em multiplayer poker / Poker Texas Hold\'em multijoueur')
  .addSubcommand(s => s.setName('start').setDescription('Start a poker table / Ouvrir une table')
    .addIntegerOption(o => o.setName('buyin').setDescription('Buy-in in PULSE (min 20) / Cave en PULSE').setMinValue(20).setMaxValue(1_000_000).setRequired(true)))
  .addSubcommand(s => s.setName('leave').setDescription('Leave the current table / Quitter la table'));

function fmtCard(c: Card): string { return `\`${cardStr(c)}\``; }
function fmtCards(cs: Card[]): string { return cs.length ? cs.map(fmtCard).join(' ') : '—'; }

function renderLobby(g: Game, en: boolean): { embeds: ReturnType<typeof pulseEmbed>[]; components: Row[] } {
  const list = g.players.map((p, i) => `${i === 0 ? '👑' : '▫️'} <@${p.discordId}> — ${p.stack} PULSE`).join('\n');
  const embed = pulseEmbed(en ? `🃏 Poker table — Lobby (${g.players.length}/8)` : `🃏 Table de poker — Salon (${g.players.length}/8)`)
    .setDescription(
      (en
        ? `**Buy-in:** ${g.buyIn} PULSE · **Blinds:** ${g.smallBlind}/${g.bigBlind}\n\n${list}\n\n_Host taps **Start** when ready. Table auto-closes if empty._`
        : `**Cave :** ${g.buyIn} PULSE · **Blinds :** ${g.smallBlind}/${g.bigBlind}\n\n${list}\n\n_L'hôte clique **Démarrer** quand tout le monde est prêt. Table auto-fermée si vide._`)
    );
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`poker:join:${g.id}`).setLabel(en ? 'Join' : 'Rejoindre').setEmoji('🎟️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`poker:leave:${g.id}`).setLabel(en ? 'Leave' : 'Quitter').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`poker:start:${g.id}`).setLabel(en ? 'Start' : 'Démarrer').setEmoji('▶️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`poker:cancel:${g.id}`).setLabel(en ? 'Cancel' : 'Annuler').setEmoji('❌').setStyle(ButtonStyle.Danger),
  );
  return { embeds: [embed], components: [row] };
}

function renderTable(g: Game, en: boolean, banner?: string): { embeds: ReturnType<typeof pulseEmbed>[]; components: Row[] } {
  const phaseLbl = en
    ? { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown', lobby: 'Lobby', ended: 'Ended' }[g.phase]
    : { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Abattage', lobby: 'Lobby', ended: 'Terminée' }[g.phase];
  const pot = g.pot + g.players.reduce((a, p) => a + p.bet, 0);
  const actor = currentActor(g);

  const lines = g.players.map((p, i) => {
    const isDealer = i === g.dealerIdx ? ' 🔘' : '';
    const isTurn = actor && actor.discordId === p.discordId ? ' ⏱️' : '';
    const state = p.folded ? '❌' : p.allIn ? '🔒' : '✅';
    return `${state} <@${p.discordId}>${isDealer}${isTurn} — ${p.stack} PULSE${p.bet ? ` · bet ${p.bet}` : ''}`;
  }).join('\n');

  const embed = pulseEmbed(en ? `🃏 Poker — Hand #${g.handNumber} · ${phaseLbl}` : `🃏 Poker — Main n°${g.handNumber} · ${phaseLbl}`)
    .setDescription(
      (banner ? `${banner}\n\n` : '') +
      (en
        ? `**Community:** ${fmtCards(g.community)}\n**Pot:** ${pot} PULSE · **To call:** ${g.toCall}\n\n${lines}`
        : `**Cartes commune :** ${fmtCards(g.community)}\n**Pot :** ${pot} PULSE · **À suivre :** ${g.toCall}\n\n${lines}`) +
      (actor
        ? `\n\n${en ? '⏱️ Waiting on' : '⏱️ En attente de'} <@${actor.discordId}>`
        : '')
    );

  const rows: Row[] = [];
  if (actor && ['preflop', 'flop', 'turn', 'river'].includes(g.phase)) {
    const need = g.toCall - actor.bet;
    const canCheck = need <= 0;
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`poker:act:${g.id}:check`).setLabel(en ? 'Check' : 'Parole').setEmoji('✅').setStyle(ButtonStyle.Secondary).setDisabled(!canCheck),
      new ButtonBuilder().setCustomId(`poker:act:${g.id}:call`).setLabel((en ? `Call ${need}` : `Suivre ${need}`)).setEmoji('📞').setStyle(ButtonStyle.Primary).setDisabled(need <= 0 || need > actor.stack),
      new ButtonBuilder().setCustomId(`poker:raise:${g.id}`).setLabel(en ? 'Raise' : 'Relancer').setEmoji('📈').setStyle(ButtonStyle.Success).setDisabled(actor.stack === 0),
      new ButtonBuilder().setCustomId(`poker:act:${g.id}:allin`).setLabel(en ? 'All-in' : 'Tapis').setEmoji('🔥').setStyle(ButtonStyle.Success).setDisabled(actor.stack === 0),
      new ButtonBuilder().setCustomId(`poker:act:${g.id}:fold`).setLabel(en ? 'Fold' : 'Coucher').setEmoji('🏳️').setStyle(ButtonStyle.Danger),
    ));
  }
  rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`poker:leave:${g.id}`).setLabel(en ? 'Leave (fold & cash out next hand)' : 'Quitter (fold + retrait à la prochaine main)').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
  ));
  return { embeds: [embed], components: rows };
}

function renderShowdown(g: Game, sd: ShowdownResult, en: boolean): { embeds: ReturnType<typeof pulseEmbed>[]; components: Row[] } {
  const reveals = sd.reveals.map(r => `<@${r.discordId}> — ${fmtCards(r.hole)}  _${r.handLabel}_`).join('\n');
  const winners = sd.winners.map(w => `🏆 <@${w.discordId}> — **+${w.amount} PULSE** _(${w.handLabel})_`).join('\n');
  const embed = pulseEmbed(en ? '🃏 Poker — Showdown' : '🃏 Poker — Abattage').setDescription(
    (en
      ? `**Community:** ${fmtCards(sd.communityFinal)}\n\n${reveals || '_(no reveals — everyone folded)_'}\n\n${winners}\n\n_Next hand deals in 6s…_`
      : `**Cartes commune :** ${fmtCards(sd.communityFinal)}\n\n${reveals || '_(pas d\'abattage — tout le monde s\'est couché)_'}\n\n${winners}\n\n_Prochaine main dans 6s…_`)
  );
  return { embeds: [embed], components: [] };
}

async function refreshTableMessage(client: Client, g: Game, en: boolean, banner?: string): Promise<void> {
  if (!g.message) return;
  const ch = await client.channels.fetch(g.message.channelId).catch(() => null);
  if (!ch || !ch.isTextBased() || ch.isDMBased()) return;
  const msg = await (ch as { messages: { fetch: (id: string) => Promise<Message> } }).messages.fetch(g.message.id).catch(() => null);
  if (!msg) return;
  await msg.edit(renderTable(g, en, banner)).catch(err => log('ERROR', 'poker refresh failed', err));
}

async function dmHoleCards(client: Client, g: Game): Promise<void> {
  for (const p of g.players) {
    if (p.folded || !p.hole.length) continue;
    const key = `${g.id}:${g.handNumber}:${p.discordId}`;
    if (dmedHoleCards.has(key)) continue;
    dmedHoleCards.add(key);
    try {
      const user = await client.users.fetch(p.discordId);
      const en = (await getUserLocale(p.discordId)) === 'en';
      await user.send({
        embeds: [pulseEmbed(en ? `🂠 Hand #${g.handNumber} — your cards` : `🂠 Main n°${g.handNumber} — tes cartes`)
          .setDescription(en
            ? `**Your hole cards:** ${fmtCards(p.hole)}\n\nPlay in <#${g.channelId}>. Blinds ${g.smallBlind}/${g.bigBlind}. Stack ${p.stack}.`
            : `**Tes cartes fermées :** ${fmtCards(p.hole)}\n\nJoue dans <#${g.channelId}>. Blinds ${g.smallBlind}/${g.bigBlind}. Tapis ${p.stack}.`)],
      });
    } catch {
      // User might have DMs closed — they'll have to fold or peek via /poker peek… best effort only.
    }
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';

  if (!isGameEnabled('poker')) {
    // Auto-enable poker if the panel row hasn't been seen yet — fail-soft: use it.
    // Fallback: allow to run regardless if getGameConfig returns null.
    const cfg = getGameConfig('poker');
    if (cfg && !cfg.is_enabled) {
      await interaction.reply({ embeds: [errorEmbed(en ? 'Poker is currently disabled.' : 'Le poker est désactivé pour l\'instant.')], flags: MessageFlags.Ephemeral });
      return;
    }
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'start') {
    const buyIn = interaction.options.getInteger('buyin', true);
    if (getGameByChannel(interaction.channelId)) {
      await interaction.reply({ embeds: [errorEmbed(en ? 'A poker table is already open here.' : 'Une table de poker est déjà ouverte ici.')], flags: MessageFlags.Ephemeral });
      return;
    }
    const res = await createGame(interaction.user.id, interaction.user.username, interaction.channelId, buyIn);
    if (!res.ok || !res.game) {
      await interaction.reply({ embeds: [errorEmbed(res.error ?? (en ? 'Cannot start.' : 'Impossible de démarrer.'))], flags: MessageFlags.Ephemeral });
      return;
    }
    const client = interaction.client;
    attachListener(res.game.id, async (evt, g) => {
      if (evt === 'hand_dealt') {
        await dmHoleCards(client, g);
        await refreshTableMessage(client, g, en);
      }
      if (evt === 'game_ended') {
        await refreshTableMessage(client, g, en, en ? '🏁 Table closed.' : '🏁 Table fermée.');
      }
    });

    const reply = await interaction.reply({ ...renderLobby(res.game, en), fetchReply: true });
    res.game.message = { channelId: reply.channelId, id: reply.id };
    return;
  }

  if (sub === 'leave') {
    const g = getGameByChannel(interaction.channelId);
    if (!g) {
      await interaction.reply({ embeds: [errorEmbed(en ? 'No poker table here.' : 'Pas de table de poker ici.')], flags: MessageFlags.Ephemeral });
      return;
    }
    const res = await leaveGame(g.id, interaction.user.id);
    if (!res.ok) {
      await interaction.reply({ embeds: [errorEmbed(res.error ?? 'Error')], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ embeds: [successEmbed(en
      ? `You left the table${res.refunded ? ` — ${res.refunded} PULSE refunded` : ''}.`
      : `Tu as quitté la table${res.refunded ? ` — ${res.refunded} PULSE remboursés` : ''}.`)], flags: MessageFlags.Ephemeral });
    await refreshTableMessage(interaction.client, g, en);
    return;
  }
}

// ---- Button + modal router ----
async function bannerForResult(en: boolean, actorId: string, action: string, raise?: number): Promise<string> {
  const label = action === 'check' ? (en ? 'checks' : 'parole')
    : action === 'call' ? (en ? 'calls' : 'suit')
    : action === 'fold' ? (en ? 'folds' : 'se couche')
    : action === 'allin' ? (en ? 'goes all-in' : 'fait tapis')
    : action === 'raise' ? (en ? `raises to ${raise}` : `relance à ${raise}`)
    : action;
  return `<@${actorId}> ${label}.`;
}

export async function handlePokerInteraction(interaction: Interaction): Promise<void> {
  if (interaction.isButton()) {
    const parts = interaction.customId.split(':');
    if (parts[0] !== 'poker') return;
    const kind = parts[1];
    const gameId = parts[2];
    const locale = await getUserLocale(interaction.user.id);
    const en = locale === 'en';
    const g = getGame(gameId);
    if (!g) {
      await interaction.reply({ embeds: [errorEmbed(en ? 'That table is gone.' : 'Cette table n\'existe plus.')], flags: MessageFlags.Ephemeral });
      return;
    }

    if (kind === 'join') {
      const r = await joinGame(g.id, interaction.user.id, interaction.user.username);
      if (!r.ok) { await interaction.reply({ embeds: [errorEmbed(r.error ?? 'Error')], flags: MessageFlags.Ephemeral }); return; }
      await interaction.update(renderLobby(g, en));
      return;
    }

    if (kind === 'leave') {
      const r = await leaveGame(g.id, interaction.user.id);
      if (!r.ok) { await interaction.reply({ embeds: [errorEmbed(r.error ?? 'Error')], flags: MessageFlags.Ephemeral }); return; }
      if (g.phase === 'lobby') {
        const gStill = getGame(g.id);
        if (!gStill) {
          await interaction.update({ embeds: [pulseEmbed(en ? '🃏 Table closed' : '🃏 Table fermée').setDescription(en ? 'Everyone left.' : 'Tout le monde est parti.')], components: [] });
        } else {
          await interaction.update(renderLobby(gStill, en));
        }
      } else {
        await interaction.reply({ embeds: [successEmbed(en ? 'You will be folded this hand.' : 'Tu seras couché sur cette main.')], flags: MessageFlags.Ephemeral });
        await refreshTableMessage(interaction.client, g, en);
      }
      return;
    }

    if (kind === 'cancel') {
      if (g.hostId !== interaction.user.id) {
        await interaction.reply({ embeds: [errorEmbed(en ? 'Only the host can cancel.' : 'Seul l\'hôte peut annuler.')], flags: MessageFlags.Ephemeral });
        return;
      }
      // Refund all lobby buy-ins
      if (g.phase === 'lobby') {
        const { earnPulse } = await import('../services/games.js');
        for (const p of g.players) await earnPulse(p.discordId, p.stack, 'Poker cancel refund', g.id);
      }
      endGame(g.id);
      await interaction.update({ embeds: [pulseEmbed(en ? '🃏 Table cancelled' : '🃏 Table annulée').setDescription(en ? 'All buy-ins refunded.' : 'Toutes les caves remboursées.')], components: [] });
      return;
    }

    if (kind === 'start') {
      const r = startGame(g.id, interaction.user.id);
      if (!r.ok) { await interaction.reply({ embeds: [errorEmbed(r.error ?? 'Error')], flags: MessageFlags.Ephemeral }); return; }
      await interaction.update(renderTable(g, en, en ? '🂠 Hand dealt — check your DMs for your hole cards.' : '🂠 Main distribuée — vérifie tes DM pour tes cartes.'));
      return;
    }

    if (kind === 'raise') {
      const actor = currentActor(g);
      if (!actor || actor.discordId !== interaction.user.id) {
        await interaction.reply({ embeds: [errorEmbed(en ? 'Not your turn.' : 'Ce n\'est pas ton tour.')], flags: MessageFlags.Ephemeral });
        return;
      }
      const modal = new ModalBuilder().setCustomId(`poker:raisemodal:${g.id}`).setTitle(en ? 'Raise to…' : 'Relancer à…').addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('amount')
            .setLabel(en ? `Total bet this round (min ${g.toCall + g.minRaise})` : `Mise totale ce tour (min ${g.toCall + g.minRaise})`)
            .setStyle(TextInputStyle.Short).setRequired(true).setValue(String(g.toCall + g.minRaise))));
      await interaction.showModal(modal);
      return;
    }

    if (kind === 'act') {
      const action = parts[3] as 'check' | 'call' | 'fold' | 'allin';
      const r = await playerAction(g.id, interaction.user.id, action);
      if (!r.ok) { await interaction.reply({ embeds: [errorEmbed(r.error ?? 'Error')], flags: MessageFlags.Ephemeral }); return; }
      const banner = await bannerForResult(en, interaction.user.id, action);
      if (r.showdown) {
        await interaction.update(renderShowdown(g, r.showdown, en));
        return;
      }
      await interaction.update(renderTable(g, en, banner));
      return;
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('poker:raisemodal:')) {
    const gameId = interaction.customId.split(':')[2];
    const g = getGame(gameId);
    const locale = await getUserLocale(interaction.user.id);
    const en = locale === 'en';
    if (!g) { await interaction.reply({ embeds: [errorEmbed(en ? 'Table gone.' : 'Table introuvable.')], flags: MessageFlags.Ephemeral }); return; }
    const raw = interaction.fields.getTextInputValue('amount').trim();
    const amount = Math.floor(Number(raw));
    if (!Number.isFinite(amount) || amount <= 0) {
      await interaction.reply({ embeds: [errorEmbed(en ? 'Invalid amount.' : 'Montant invalide.')], flags: MessageFlags.Ephemeral });
      return;
    }
    const r = await playerAction(g.id, interaction.user.id, 'raise', amount);
    if (!r.ok) { await interaction.reply({ embeds: [errorEmbed(r.error ?? 'Error')], flags: MessageFlags.Ephemeral }); return; }
    const banner = await bannerForResult(en, interaction.user.id, 'raise', amount);
    if (r.showdown) {
      await handleShowdownUpdate(interaction as ModalSubmitInteraction, g, r.showdown, en);
      return;
    }
    await handleTableUpdate(interaction as ModalSubmitInteraction, g, en, banner);
  }
}

async function handleTableUpdate(interaction: ModalSubmitInteraction, g: Game, en: boolean, banner: string): Promise<void> {
  // Modal submits don't have "update"; edit the source message directly.
  await interaction.deferUpdate().catch(() => null);
  await refreshTableMessage(interaction.client, g, en, banner);
}

async function handleShowdownUpdate(interaction: ModalSubmitInteraction, g: Game, sd: ShowdownResult, en: boolean): Promise<void> {
  await interaction.deferUpdate().catch(() => null);
  if (!g.message) return;
  const ch = await interaction.client.channels.fetch(g.message.channelId).catch(() => null);
  if (!ch || !ch.isTextBased() || ch.isDMBased()) return;
  const msg = await (ch as { messages: { fetch: (id: string) => Promise<Message> } }).messages.fetch(g.message.id).catch(() => null);
  if (!msg) return;
  await msg.edit(renderShowdown(g, sd, en)).catch(err => log('ERROR', 'poker showdown refresh failed', err));
}

// Suppress unused-import complaint if reactivated later
export function _unused(_b?: ButtonInteraction): void { /* noop */ }
