import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  MessageFlags,
  ModalSubmitInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import { spendPulse, getBalance } from '../services/economy.js';
import {
  getGameConfig,
  isGameEnabled,
  createGameSession,
  updateGameSession,
  addGamePlayer,
  setPlayerPayout,
  saveGameResult,
  earnPulse,
} from '../services/games.js';
import { pulseEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';
import { buildPostGameRow } from '../utils/postgame.js';
import { getUserLocale } from '../i18n.js';

interface BlackjackConfig {
  min_bet: number;
  max_bet: number;
  blackjack_payout_num: number;
  blackjack_payout_den: number;
  dealer_stand_min: number;
}

const DEFAULT_CONFIG: BlackjackConfig = {
  min_bet: 10, max_bet: 500, blackjack_payout_num: 3, blackjack_payout_den: 2, dealer_stand_min: 17,
};

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

interface Card { rank: string; suit: string }

function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ rank: r, suit: s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function handValue(hand: Card[]): number {
  let total = 0;
  let aces = 0;
  for (const c of hand) {
    if (c.rank === 'A') { total += 11; aces++; }
    else if (['J', 'Q', 'K'].includes(c.rank)) total += 10;
    else total += parseInt(c.rank, 10);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function formatHand(hand: Card[], hideSecond = false): string {
  if (hideSecond && hand.length >= 2) {
    return `\`${hand[0].rank}${hand[0].suit}\` \`??\``;
  }
  return hand.map(c => `\`${c.rank}${c.suit}\``).join(' ');
}

export const data = new SlashCommandBuilder()
  .setName('blackjack')
  .setDescription('Play Blackjack against the dealer')
  .addIntegerOption(o => o.setName('bet').setDescription('PULSE to bet').setRequired(true).setMinValue(1));

export async function execute(interaction: ChatInputCommandInteraction) {
  const bet = interaction.options.getInteger('bet', true);
  await runBlackjack(interaction, bet);
}

export async function runBlackjack(interaction: ChatInputCommandInteraction | ModalSubmitInteraction | ButtonInteraction, bet: number): Promise<void> {
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';

  if (!isGameEnabled('blackjack')) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'Blackjack is currently disabled.' : 'Le blackjack est désactivé pour l\'instant.')], flags: MessageFlags.Ephemeral });
    return;
  }

  const raw = getGameConfig('blackjack')?.config_json as Partial<BlackjackConfig> | undefined;
  const cfg: BlackjackConfig = { ...DEFAULT_CONFIG, ...(raw ?? {}) };

  if (bet < cfg.min_bet || bet > cfg.max_bet) {
    await interaction.reply({ embeds: [errorEmbed(en
      ? `Bet must be between ${cfg.min_bet} and ${cfg.max_bet} PULSE.`
      : `La mise doit être entre ${cfg.min_bet} et ${cfg.max_bet} PULSE.`)], flags: MessageFlags.Ephemeral });
    return;
  }

  const bal = await getBalance(interaction.user.id);
  if (!bal || bal.balance < bet) {
    await interaction.reply({ embeds: [errorEmbed(en
      ? `Not enough PULSE. You have ${bal?.balance ?? 0}.`
      : `Pas assez de PULSE. Tu as ${bal?.balance ?? 0}.`)], flags: MessageFlags.Ephemeral });
    return;
  }

  const spend = await spendPulse(interaction.user.id, bet, 'blackjack_bet');
  if (!spend.success) {
    await interaction.reply({ embeds: [errorEmbed(spend.error ?? (en ? 'Failed to place bet.' : 'Échec de la mise.'))], flags: MessageFlags.Ephemeral });
    return;
  }

  const sessionId = await createGameSession('blackjack', interaction.channelId ?? '', { bet });
  if (sessionId) await addGamePlayer(sessionId, interaction.user.id, bet);

  const deck = newDeck();
  const player: Card[] = [deck.pop()!, deck.pop()!];
  const dealer: Card[] = [deck.pop()!, deck.pop()!];

  const playerBJ = handValue(player) === 21;
  const dealerBJ = handValue(dealer) === 21;

  async function finish(outcome: 'win' | 'lose' | 'push' | 'blackjack' | 'bust', resolved: Card[]): Promise<void> {
    let payout = 0;
    if (outcome === 'blackjack') payout = Math.floor(bet + bet * (cfg.blackjack_payout_num / cfg.blackjack_payout_den));
    else if (outcome === 'win') payout = bet * 2;
    else if (outcome === 'push') payout = bet;

    if (payout > 0) {
      await earnPulse(interaction.user.id, payout, `blackjack_${outcome}`, sessionId ?? undefined);
      if (sessionId) await setPlayerPayout(sessionId, interaction.user.id, payout);
    }
    if (sessionId) {
      await updateGameSession(sessionId, { status: 'completed', ended_at: new Date().toISOString() });
      await saveGameResult(sessionId, {
        outcome, payout, playerHand: player, dealerHand: resolved,
        playerTotal: handValue(player), dealerTotal: handValue(resolved),
      });
    }

    const net = payout - bet;
    const yourHandLbl = en ? 'Your hand' : 'Ta main';
    const dealerHandLbl = en ? 'Dealer hand' : 'Main du croupier';
    const outcomeLine = en
      ? (outcome === 'blackjack' ? `🎉 **Blackjack!** You win **${payout}** PULSE (net +${net}).`
       : outcome === 'win'       ? `🎉 You win **${payout}** PULSE (net +${net}).`
       : outcome === 'push'      ? `🤝 Push — bet returned.`
       : outcome === 'bust'      ? `💥 Bust! You lose **${bet}** PULSE.`
       :                            `❌ Dealer wins. You lose **${bet}** PULSE.`)
      : (outcome === 'blackjack' ? `🎉 **Blackjack !** Tu gagnes **${payout}** PULSE (net +${net}).`
       : outcome === 'win'       ? `🎉 Tu gagnes **${payout}** PULSE (net +${net}).`
       : outcome === 'push'      ? `🤝 Égalité — mise remboursée.`
       : outcome === 'bust'      ? `💥 Bust ! Tu perds **${bet}** PULSE.`
       :                            `❌ Le croupier gagne. Tu perds **${bet}** PULSE.`);
    const desc = [
      `**${yourHandLbl}:** ${formatHand(player)} (**${handValue(player)}**)`,
      `**${dealerHandLbl}:** ${formatHand(resolved)} (**${handValue(resolved)}**)`,
      '',
      outcomeLine,
    ].join('\n');

    const embed = (outcome === 'win' || outcome === 'blackjack' ? successEmbed(desc) : outcome === 'push' ? pulseEmbed('🃏 Blackjack').setDescription(desc) : errorEmbed(desc)).setTitle('🃏 Blackjack');
    await interaction.editReply({ embeds: [embed], components: [buildPostGameRow('blackjack', bet)] });
  }

  if (playerBJ || dealerBJ) {
    const yourHandLbl = en ? 'Your hand' : 'Ta main';
    const dealerLbl = en ? 'Dealer' : 'Croupier';
    await interaction.reply({
      embeds: [pulseEmbed('🃏 Blackjack').setDescription(`**${yourHandLbl}:** ${formatHand(player)} (**${handValue(player)}**)\n**${dealerLbl}:** ${formatHand(dealer)} (**${handValue(dealer)}**)`)],
    });
    if (playerBJ && !dealerBJ) await finish('blackjack', dealer);
    else if (!playerBJ && dealerBJ) await finish('lose', dealer);
    else await finish('push', dealer);
    return;
  }

  const hitBtn = new ButtonBuilder().setCustomId('bj_hit').setLabel(en ? 'Hit' : 'Tirer').setStyle(ButtonStyle.Primary);
  const standBtn = new ButtonBuilder().setCustomId('bj_stand').setLabel(en ? 'Stand' : 'Rester').setStyle(ButtonStyle.Secondary);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(hitBtn, standBtn);

  const betLbl = en ? 'Bet' : 'Mise';
  const yourHandLbl = en ? 'Your hand' : 'Ta main';
  const dealerShowsLbl = en ? 'Dealer shows' : 'Le croupier montre';
  const turnFooter = en ? 'Hit to draw, Stand to end your turn.' : 'Tirer pour une carte, Rester pour finir ton tour.';

  const renderTurn = () => pulseEmbed('🃏 Blackjack').setDescription([
    `**${betLbl}:** ${bet} PULSE`,
    `**${yourHandLbl}:** ${formatHand(player)} (**${handValue(player)}**)`,
    `**${dealerShowsLbl}:** ${formatHand(dealer, true)}`,
  ].join('\n')).setFooter({ text: turnFooter });

  const reply = await interaction.reply({ embeds: [renderTurn()], components: [row], withResponse: true });
  const message = reply.resource?.message;
  if (!message) {
    await finish('lose', dealer);
    return;
  }

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
    filter: (i: ButtonInteraction) => i.user.id === interaction.user.id,
  });

  let resolved = false;

  collector.on('collect', async (btn) => {
    if (resolved) return;

    if (btn.customId === 'bj_hit') {
      player.push(deck.pop()!);
      if (handValue(player) > 21) {
        resolved = true;
        collector.stop('bust');
        await btn.update({ embeds: [renderTurn()], components: [] });
        await finish('bust', dealer);
        return;
      }
      if (handValue(player) === 21) {
        resolved = true;
        collector.stop('21');
        await btn.update({ embeds: [renderTurn()], components: [] });
        // play dealer
        while (handValue(dealer) < cfg.dealer_stand_min) dealer.push(deck.pop()!);
        const ptotal = handValue(player);
        const dtotal = handValue(dealer);
        await finish(dtotal > 21 || ptotal > dtotal ? 'win' : ptotal < dtotal ? 'lose' : 'push', dealer);
        return;
      }
      await btn.update({ embeds: [renderTurn()], components: [row] });
      return;
    }

    if (btn.customId === 'bj_stand') {
      resolved = true;
      collector.stop('stand');
      await btn.deferUpdate();
      while (handValue(dealer) < cfg.dealer_stand_min) dealer.push(deck.pop()!);
      const ptotal = handValue(player);
      const dtotal = handValue(dealer);
      await finish(dtotal > 21 || ptotal > dtotal ? 'win' : ptotal < dtotal ? 'lose' : 'push', dealer);
    }
  });

  collector.on('end', async (_c, reason) => {
    if (resolved) return;
    if (reason === 'time') {
      while (handValue(dealer) < cfg.dealer_stand_min) dealer.push(deck.pop()!);
      const ptotal = handValue(player);
      const dtotal = handValue(dealer);
      await finish(dtotal > 21 || ptotal > dtotal ? 'win' : ptotal < dtotal ? 'lose' : 'push', dealer);
    }
  });
}
