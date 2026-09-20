// Bilingual announce message templates for game wins that get posted to
// Discord via the announce dashboard_command. Callers pick the locale (usually
// the caller's own — so someone playing in English broadcasts in English).

type Locale = 'fr' | 'en';

export function slotsAnnounce(locale: Locale, opts: { userId: string; multi: number; net: number; reels: string[] }): { title: string; message: string } {
  const { userId, multi, net, reels } = opts;
  if (locale === 'en') {
    return {
      title: '🎰 Big slots win!',
      message: `<@${userId}> hit ${reels.join(' ')} and won **+${net} PULSE** net (${multi.toFixed(1)}×)! 💸`,
    };
  }
  return {
    title: '🎰 Gros gain aux slots !',
    message: `<@${userId}> a fait ${reels.join(' ')} et gagne **+${net} PULSE** net (${multi.toFixed(1)}×) ! 💸`,
  };
}

export function coinflipAnnounce(locale: Locale, opts: { userId: string; outcome: 'heads' | 'tails'; payout: number }): { title: string; message: string } {
  const { userId, outcome, payout } = opts;
  const face = outcome === 'heads' ? '🪙 heads' : '🪙 tails';
  const faceFr = outcome === 'heads' ? '🪙 face' : '🪙 pile';
  if (locale === 'en') {
    return {
      title: '🪙 Coin flip win!',
      message: `<@${userId}> flipped **${face}** and doubled up to **${payout} PULSE**! 💸`,
    };
  }
  return {
    title: '🪙 Coup gagnant au coin flip !',
    message: `<@${userId}> a lancé la pièce sur **${faceFr}** et double sa mise à **${payout} PULSE** ! 💸`,
  };
}

export function higherLowerAnnounce(locale: Locale, opts: { userId: string; seed: number; roll: number; choice: 'higher' | 'lower'; multi: number; net: number }): { title: string; message: string } {
  const { userId, seed, roll, choice, multi, net } = opts;
  if (locale === 'en') {
    return {
      title: '🔼 Higher/Lower win!',
      message: `<@${userId}> called **${choice.toUpperCase()}** on ${seed}, rolled **${roll}** and won **+${net} PULSE** (${multi}×)! 💸`,
    };
  }
  const choiceFr = choice === 'higher' ? 'PLUS HAUT' : 'PLUS BAS';
  return {
    title: '🔼 Victoire à Higher/Lower !',
    message: `<@${userId}> a parié **${choiceFr}** sur ${seed}, tirage **${roll}** et gagne **+${net} PULSE** (${multi}×) ! 💸`,
  };
}

export function rouletteAnnounce(locale: Locale, opts: { userId: string; spin: number; color: string; net: number; winnersInline: string }): { title: string; message: string } {
  const { userId, spin, color, net, winnersInline } = opts;
  if (locale === 'en') {
    return {
      title: '🎡 Roulette big win!',
      message: `<@${userId}> hit **${spin} ${color}** and won **+${net} PULSE** net · ${winnersInline}`,
    };
  }
  return {
    title: '🎡 Gros gain à la roulette !',
    message: `<@${userId}> tombe sur **${spin} ${color}** et gagne **+${net} PULSE** net · ${winnersInline}`,
  };
}

export function chickenAnnounce(locale: Locale, opts: { userId: string; multi: number; bet: number; payout: number }): { title: string; message: string } {
  const { userId, multi, bet, payout } = opts;
  if (locale === 'en') {
    return {
      title: '🐔 Chicken race win!',
      message: `<@${userId}> cashed out at **${multi.toFixed(2)}×** on a ${bet} PULSE bet — walks away with **${payout} PULSE**! 💸`,
    };
  }
  return {
    title: '🐔 Victoire à la Chicken Race !',
    message: `<@${userId}> a cash-out à **${multi.toFixed(2)}×** sur une mise de ${bet} PULSE — repart avec **${payout} PULSE** ! 💸`,
  };
}

export function pickLocale(body: unknown): Locale {
  if (body && typeof body === 'object' && (body as { locale?: string }).locale === 'en') return 'en';
  return 'fr';
}
