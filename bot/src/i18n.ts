import { supabase } from './supabase.js';

export type Locale = 'fr' | 'en';

// Cache locales briefly so we don't hit the DB on every command execution.
// Cleared per-user on set.
const cache = new Map<string, { locale: Locale; ts: number }>();
const CACHE_TTL_MS = 5 * 60_000;

export async function getUserLocale(discordId: string): Promise<Locale> {
  const now = Date.now();
  const c = cache.get(discordId);
  if (c && now - c.ts < CACHE_TTL_MS) return c.locale;

  const { data } = await supabase
    .from('discord_users')
    .select('locale')
    .eq('discord_id', discordId)
    .maybeSingle();
  const raw = (data as { locale?: string } | null)?.locale;
  const locale: Locale = raw === 'en' ? 'en' : 'fr';
  cache.set(discordId, { locale, ts: now });
  return locale;
}

export async function setUserLocale(discordId: string, locale: Locale): Promise<void> {
  await supabase.from('discord_users').update({ locale }).eq('discord_id', discordId);
  cache.set(discordId, { locale, ts: Date.now() });
}

// The dictionary. Kept flat for readability. Values can carry {placeholders}.
export const M = {
  fr: {
    common: {
      insufficient: 'Pas assez de PULSE.',
      no_user: 'Envoie un message dans le serveur d\'abord pour être enregistré.',
      balance: 'Solde',
      pulse: 'PULSE',
      bet: 'Mise',
      win: 'Gagné',
      loss: 'Perdu',
      new_balance: 'Nouveau solde',
      total: 'Total',
      free: 'Gratuit',
      error: 'Erreur',
      success: 'Succès',
      unavailable: 'Indisponible pour l\'instant.',
      cooldown_wait: 'Attends encore {time}.',
    },
    language: {
      set_fr: '🇫🇷 Langue passée en français. Tous les jeux et commandes sont maintenant en français.',
      set_en: '🇬🇧 Language switched to English. All games and commands are now in English.',
    },
    daily: {
      title: '💰 Daily claim',
      reward: 'Tu récupères **{amount} PULSE** !',
      already: 'Tu as déjà réclamé ton daily. Reviens dans {time}.',
      streak: 'Série de {days} jour(s) 🔥',
      streak_bonus: 'Bonus de série : +{amount}',
    },
    profile: {
      title: 'Profil de {name}',
      rank: 'Rang',
      streak: 'Streak',
      points: 'Points',
      points_week: 'Points semaine',
      points_month: 'Points mois',
      badges: 'Badges',
      title_cosmetic: 'Titre',
      joined: 'Membre depuis',
    },
    balance: {
      you_have: 'Tu as **{amount} PULSE**.',
    },
    leaderboard: {
      title: '🏆 Classement',
      empty: 'Personne pour l\'instant.',
      you_are: 'Tu es #{rank}',
      by_points: 'Par points totaux',
      by_pulse: 'Par PULSE',
    },
    shop: {
      title: '🛍️ Boutique PULSE',
      footer: 'Achète avec `/buy nom_de_l_article`',
      empty: 'Aucun article disponible.',
      stock_left: '({n} restants)',
    },
    buy: {
      not_found: 'Article "{name}" introuvable. Utilise /shop.',
      out_of_stock: 'Rupture de stock !',
      max_reached: 'Tu as atteint la limite d\'achat pour cet article.',
      success: 'Acheté **{name}** pour {price} PULSE !\n{applied}\nNouveau solde : **{balance}** PULSE',
      auto_applied: 'Ton article a été appliqué automatiquement !',
      pending: 'Ta commande est en attente d\'approbation admin.',
      failed: 'Achat échoué.',
    },
    help: {
      title: '🤖 Commandes Novarys',
      games: '🎮 Jeux',
      economy: '💰 Économie',
      profile: '📊 Profil',
      community: '🎉 Communauté',
      admin: '⚙️ Admin (Lords)',
      other: '🔧 Autres',
      language_hint: 'Utilise `/language` pour changer entre français et anglais.',
    },
    coinflip: {
      title: '🪙 Pile ou Face',
      wait_choice: 'Choisis pile ou face…',
      you_bet: 'Tu paries **{bet} PULSE** sur **{side}**.',
      heads: 'Face',
      tails: 'Pile',
      won: '🎉 **{side}** ! Tu gagnes **{payout} PULSE**.',
      lost: '💥 Tombé sur **{side}**. Tu perds **{bet} PULSE**.',
    },
    higherlower: {
      title: '🔼 Higher / Lower',
      instructions: 'La carte est **{seed}**. Plus haut ou plus bas ?',
      higher: 'Plus haut',
      lower: 'Plus bas',
      result: 'La carte tirée : **{roll}**',
      won: '🎉 Bien vu ! Tu gagnes **{payout} PULSE** ({multi}×).',
      lost: '💥 Raté. Tu perds **{bet} PULSE**.',
    },
    slots: {
      title: '🎰 Slots',
      spinning: 'Ça tourne…',
      won: '🎉 **{combo}** — Tu gagnes **{payout} PULSE** ({multi}×) !',
      lost: '💥 **{combo}** — Tu perds **{bet} PULSE**.',
    },
  },
  en: {
    common: {
      insufficient: 'Not enough PULSE.',
      no_user: 'Send a message in the server first so we can register you.',
      balance: 'Balance',
      pulse: 'PULSE',
      bet: 'Bet',
      win: 'Won',
      loss: 'Lost',
      new_balance: 'New balance',
      total: 'Total',
      free: 'Free',
      error: 'Error',
      success: 'Success',
      unavailable: 'Not available right now.',
      cooldown_wait: 'Wait {time} longer.',
    },
    language: {
      set_fr: '🇫🇷 Langue passée en français. Tous les jeux et commandes sont maintenant en français.',
      set_en: '🇬🇧 Language switched to English. All games and commands are now in English.',
    },
    daily: {
      title: '💰 Daily claim',
      reward: 'You claimed **{amount} PULSE**!',
      already: 'You already claimed your daily. Come back in {time}.',
      streak: '{days}-day streak 🔥',
      streak_bonus: 'Streak bonus: +{amount}',
    },
    profile: {
      title: '{name}\'s profile',
      rank: 'Rank',
      streak: 'Streak',
      points: 'Points',
      points_week: 'Weekly points',
      points_month: 'Monthly points',
      badges: 'Badges',
      title_cosmetic: 'Title',
      joined: 'Joined',
    },
    balance: {
      you_have: 'You have **{amount} PULSE**.',
    },
    leaderboard: {
      title: '🏆 Leaderboard',
      empty: 'Nobody yet.',
      you_are: 'You are #{rank}',
      by_points: 'By total points',
      by_pulse: 'By PULSE',
    },
    shop: {
      title: '🛍️ PULSE Shop',
      footer: 'Buy with `/buy item_name`',
      empty: 'No items available.',
      stock_left: '({n} left)',
    },
    buy: {
      not_found: 'Item "{name}" not found. Use /shop to browse.',
      out_of_stock: 'This item is out of stock!',
      max_reached: 'You reached the purchase limit for this item.',
      success: 'Purchased **{name}** for {price} PULSE!\n{applied}\nNew balance: **{balance}** PULSE',
      auto_applied: 'Your item has been applied automatically!',
      pending: 'Your order is pending admin approval.',
      failed: 'Purchase failed.',
    },
    help: {
      title: '🤖 Novarys commands',
      games: '🎮 Games',
      economy: '💰 Economy',
      profile: '📊 Profile',
      community: '🎉 Community',
      admin: '⚙️ Admin (Lords)',
      other: '🔧 Other',
      language_hint: 'Use `/language` to switch between English and French.',
    },
    coinflip: {
      title: '🪙 Coin Flip',
      wait_choice: 'Pick heads or tails…',
      you_bet: 'You bet **{bet} PULSE** on **{side}**.',
      heads: 'Heads',
      tails: 'Tails',
      won: '🎉 **{side}**! You win **{payout} PULSE**.',
      lost: '💥 Landed on **{side}**. You lose **{bet} PULSE**.',
    },
    higherlower: {
      title: '🔼 Higher / Lower',
      instructions: 'The card is **{seed}**. Higher or lower?',
      higher: 'Higher',
      lower: 'Lower',
      result: 'Drawn card: **{roll}**',
      won: '🎉 Nailed it! You win **{payout} PULSE** ({multi}×).',
      lost: '💥 Missed. You lose **{bet} PULSE**.',
    },
    slots: {
      title: '🎰 Slots',
      spinning: 'Spinning…',
      won: '🎉 **{combo}** — You win **{payout} PULSE** ({multi}×)!',
      lost: '💥 **{combo}** — You lose **{bet} PULSE**.',
    },
  },
} as const;

type Section = keyof typeof M['fr'];
type LeafKey<S extends Section> = keyof typeof M['fr'][S];

// t('coinflip', 'won', locale, { side: 'Heads', payout: 100 })
export function t<S extends Section>(section: S, key: LeafKey<S>, locale: Locale, vars: Record<string, string | number> = {}): string {
  const dict = M[locale] as unknown as Record<Section, Record<string, string>>;
  const raw = dict[section]?.[key as string] ?? (M.fr as unknown as Record<Section, Record<string, string>>)[section]?.[key as string] ?? String(key);
  return raw.replace(/\{(\w+)\}/g, (_m, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
