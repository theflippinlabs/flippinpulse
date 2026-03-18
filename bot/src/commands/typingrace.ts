import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  Message,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalSubmitInteraction,
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

const SENTENCES = [
  'The quick brown fox jumps over the lazy dog',
  'Pack my box with five dozen liquor jugs',
  'How vexingly quick daft zebras jump',
  'The five boxing wizards jump quickly',
  'Amazingly few discotheques provide jukeboxes',
  'Sphinx of black quartz judge my vow',
  'Two driven jocks help fax my big quiz',
  'The jay pig fox and zebra quickly vanished',
  'Grumpy wizards make toxic brew for evil queen',
  'Quick zephyrs blow vexing daft Jim',
  'Pulse engine powers the community forward',
  'Every great community starts with a single message',
  'Discord bots make server management easier',
  'Typing fast is a valuable skill to develop',
  'The treasure was hidden deep in the dark cave',
];

export const data = new SlashCommandBuilder()
  .setName('typingrace')
  .setDescription('Start a typing race — type the sentence fastest to win!')
  .addIntegerOption(opt =>
    opt.setName('bet')
      .setDescription('PULSE to wager (optional)')
      .setRequired(false)
      .setMinValue(0)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!isGameEnabled('typing_race')) {
    await interaction.reply({ embeds: [errorEmbed('Typing Race is currently disabled.')], ephemeral: true });
    return;
  }

  const cfg = getGameConfig('typing_race');
  const conf = (cfg?.config_json ?? {}) as {
    min_bet: number; max_bet: number; fixed_reward: number;
    cooldown_seconds: number; max_players: number; join_timeout_seconds: number;
  };
  const fixedReward = conf.fixed_reward ?? 25;
  const maxPlayers = conf.max_players ?? 5;
  const joinTimeout = (conf.join_timeout_seconds ?? 30) * 1000;

  const bet = interaction.options.getInteger('bet') ?? 0;

  if (bet > 0) {
    const bal = await getBalance(interaction.user.id);
    if (!bal || bal.balance < bet) {
      await interaction.reply({ embeds: [errorEmbed(`Insufficient PULSE. Balance: ${bal?.balance ?? 0}`)], ephemeral: true });
      return;
    }
  }

  const sentence = SENTENCES[Math.floor(Math.random() * SENTENCES.length)];

  const sessionId = await createGameSession('typing_race', interaction.channelId, {
    sentence,
    bet,
    players: [interaction.user.id],
  });

  if (!sessionId) {
    await interaction.reply({ embeds: [errorEmbed('Failed to create race.')], ephemeral: true });
    return;
  }

  // Deduct bet from host
  if (bet > 0) {
    await spendPulse(interaction.user.id, bet, 'typingrace_bet', sessionId);
  }
  await addGamePlayer(sessionId, interaction.user.id, bet);

  const players = new Set<string>([interaction.user.id]);
  const playerNames = new Map<string, string>([[interaction.user.id, interaction.user.username]]);

  const joinBtn = new ButtonBuilder()
    .setCustomId(`race_join_${sessionId}`)
    .setLabel(`🏁 Join Race (${players.size}/${maxPlayers})`)
    .setStyle(ButtonStyle.Primary);

  const startBtn = new ButtonBuilder()
    .setCustomId(`race_start_${sessionId}`)
    .setLabel('▶️ Start Race')
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn, startBtn);

  const lobbyEmbed = pulseEmbed('🏁 Typing Race — Lobby')
    .setDescription(
      `**${interaction.user.username}** is hosting a typing race!\n\n` +
      `${bet > 0 ? `💰 Entry: **${bet}** PULSE\n` : '🆓 Free entry\n'}` +
      `👥 Players: ${[...playerNames.values()].join(', ')}\n\n` +
      `Click Join to enter, or Start when ready!`
    );

  const reply = await interaction.reply({ embeds: [lobbyEmbed], components: [row], fetchReply: true }) as Message;

  // Join phase
  const joinCollector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: joinTimeout,
  });

  let raceStarted = false;

  joinCollector.on('collect', async (btnI) => {
    if (btnI.customId === `race_join_${sessionId}` && !raceStarted) {
      if (players.has(btnI.user.id)) {
        await btnI.reply({ content: 'You already joined!', ephemeral: true });
        return;
      }
      if (players.size >= maxPlayers) {
        await btnI.reply({ content: 'Race is full!', ephemeral: true });
        return;
      }

      // Check and deduct bet
      if (bet > 0) {
        const bal = await getBalance(btnI.user.id);
        if (!bal || bal.balance < bet) {
          await btnI.reply({ embeds: [errorEmbed(`You need ${bet} PULSE to join.`)], ephemeral: true });
          return;
        }
        await spendPulse(btnI.user.id, bet, 'typingrace_bet', sessionId);
      }

      players.add(btnI.user.id);
      playerNames.set(btnI.user.id, btnI.user.username);
      await addGamePlayer(sessionId, btnI.user.id, bet);

      joinBtn.setLabel(`🏁 Join Race (${players.size}/${maxPlayers})`);
      const updatedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn, startBtn);

      const updatedEmbed = pulseEmbed('🏁 Typing Race — Lobby')
        .setDescription(
          `**${interaction.user.username}** is hosting a typing race!\n\n` +
          `${bet > 0 ? `💰 Entry: **${bet}** PULSE\n` : '🆓 Free entry\n'}` +
          `👥 Players: ${[...playerNames.values()].join(', ')}\n\n` +
          `Click Join to enter, or Start when ready!`
        );

      await btnI.update({ embeds: [updatedEmbed], components: [updatedRow] });
    }

    if (btnI.customId === `race_start_${sessionId}` && btnI.user.id === interaction.user.id && !raceStarted) {
      raceStarted = true;
      joinCollector.stop('started');
      await btnI.deferUpdate();
    }
  });

  joinCollector.on('end', async (_collected, reason) => {
    if (!raceStarted && reason === 'time') {
      // Refund everyone
      for (const pid of players) {
        if (bet > 0) await earnPulse(pid, bet, 'typingrace_refund', sessionId);
      }
      await updateGameSession(sessionId, { status: 'cancelled', ended_at: new Date().toISOString() });
      await interaction.editReply({
        embeds: [errorEmbed('Race timed out. All bets refunded.').setTitle('🏁 Typing Race')],
        components: [],
      }).catch(() => {});
      return;
    }

    if (!raceStarted) return;

    // Start the race
    await updateGameSession(sessionId, { status: 'active' });

    const raceEmbed = pulseEmbed('🏁 Typing Race — GO!')
      .setDescription(
        `**Type this sentence as fast as you can:**\n\n` +
        `\`\`\`${sentence}\`\`\`\n\n` +
        `⏱️ Click the button below and type the sentence!`
      );

    const typeBtn = new ButtonBuilder()
      .setCustomId(`race_type_${sessionId}`)
      .setLabel('⌨️ Type Now!')
      .setStyle(ButtonStyle.Primary);

    const typeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(typeBtn);

    await interaction.editReply({ embeds: [raceEmbed], components: [typeRow] });

    const submissions = new Map<string, { time: number; accuracy: number; wpm: number }>();
    const startTime = Date.now();

    const typeCollector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60_000,
    });

    typeCollector.on('collect', async (typeBtnI) => {
      if (typeBtnI.customId !== `race_type_${sessionId}`) return;
      if (!players.has(typeBtnI.user.id)) return;
      if (submissions.has(typeBtnI.user.id)) {
        await typeBtnI.reply({ content: 'You already submitted!', ephemeral: true });
        return;
      }

      // Show modal
      const modal = new ModalBuilder()
        .setCustomId(`race_modal_${sessionId}_${typeBtnI.user.id}`)
        .setTitle('⌨️ Type the sentence!');

      const input = new TextInputBuilder()
        .setCustomId('typed_text')
        .setLabel('Type the sentence exactly:')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder(sentence.slice(0, 50));

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
      await typeBtnI.showModal(modal);

      // Wait for modal
      try {
        const modalInteraction = await typeBtnI.awaitModalSubmit({
          filter: (mi) => mi.customId === `race_modal_${sessionId}_${typeBtnI.user.id}`,
          time: 60_000,
        }) as ModalSubmitInteraction;

        const typed = modalInteraction.fields.getTextInputValue('typed_text');
        const elapsed = (Date.now() - startTime) / 1000;

        // Calculate accuracy
        const words1 = sentence.toLowerCase().split(' ');
        const words2 = typed.toLowerCase().split(' ');
        let correct = 0;
        for (let i = 0; i < words1.length; i++) {
          if (words2[i] === words1[i]) correct++;
        }
        const accuracy = Math.round((correct / words1.length) * 100);

        // Calculate WPM
        const wordCount = typed.split(' ').length;
        const wpm = Math.round((wordCount / elapsed) * 60);

        submissions.set(typeBtnI.user.id, { time: elapsed, accuracy, wpm });

        await modalInteraction.reply({
          content: `✅ Submitted! Time: **${elapsed.toFixed(1)}s** | Accuracy: **${accuracy}%** | WPM: **${wpm}**`,
          ephemeral: true,
        });

        // If all players submitted, end race
        if (submissions.size >= players.size) {
          typeCollector.stop('all_submitted');
        }
      } catch {
        // Modal timeout
      }
    });

    typeCollector.on('end', async () => {
      if (submissions.size === 0) {
        for (const pid of players) {
          if (bet > 0) await earnPulse(pid, bet, 'typingrace_refund', sessionId);
        }
        await updateGameSession(sessionId, { status: 'cancelled', ended_at: new Date().toISOString() });
        await interaction.editReply({
          embeds: [errorEmbed('Nobody typed anything. Bets refunded.').setTitle('🏁 Typing Race')],
          components: [],
        }).catch(() => {});
        return;
      }

      // Rank by score (accuracy * speed)
      const ranked = [...submissions.entries()]
        .map(([id, s]) => ({
          id,
          name: playerNames.get(id) ?? id,
          ...s,
          score: s.accuracy * (100 / Math.max(s.time, 1)),
        }))
        .sort((a, b) => b.score - a.score);

      const winnerId = ranked[0].id;
      const totalPot = bet * players.size;
      const payout = totalPot > 0 ? totalPot : fixedReward;

      await earnPulse(winnerId, payout, 'typingrace_win', sessionId);
      await setPlayerPayout(sessionId, winnerId, payout);
      await updateGameSession(sessionId, { status: 'completed', ended_at: new Date().toISOString() });
      await saveGameResult(sessionId, { ranked, payout });

      const medals = ['🥇', '🥈', '🥉'];
      const lines = ranked.map((r, i) => {
        const medal = medals[i] ?? `${i + 1}.`;
        return `${medal} **${r.name}** — ${r.time.toFixed(1)}s | ${r.accuracy}% accuracy | ${r.wpm} WPM`;
      });

      const resultEmbed = successEmbed(
        `🏆 **${ranked[0].name}** wins${payout > 0 ? ` **${payout}** PULSE` : ''}!\n\n` +
        lines.join('\n')
      ).setTitle('🏁 Typing Race — Results');

      await interaction.editReply({ embeds: [resultEmbed], components: [] }).catch(() => {});
    });
  });
}
