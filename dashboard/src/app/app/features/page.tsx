import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getLocale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

type Feature = 'sagas' | 'hunt' | 'guilds' | 'events' | 'marriage' | 'bank' | 'birthday' | 'stream';

interface FeatureContent {
  emoji: string;
  title: { fr: string; en: string };
  intro: { fr: string; en: string };
  commands: { fr: string; en: string }[];
  tips?: { fr: string; en: string };
}

const CONTENT: Record<Feature, FeatureContent> = {
  sagas: {
    emoji: '📖',
    title: { fr: 'Sagas — Événements narratifs', en: 'Sagas — Narrative events' },
    intro: {
      fr: 'Une saga se joue sur plusieurs jours. Chaque chapitre te donne un indice, tu résous, tu passes au suivant. Rejouable en équipe. Récompense finale en PULSE.',
      en: 'A saga plays out over several days. Each chapter gives you a clue, you solve it, you move to the next. Playable as a team. PULSE reward at the end.',
    },
    commands: [
      { fr: '/saga list — voir les sagas actives', en: '/saga list — see active sagas' },
      { fr: '/saga view id: — lire le chapitre actuel', en: '/saga view id: — read current chapter' },
      { fr: '/saga solve id: guess: — donner une réponse', en: '/saga solve id: guess: — submit an answer' },
      { fr: '/saga progress id: — voir ta progression', en: '/saga progress id: — see your progress' },
    ],
  },
  hunt: {
    emoji: '🗺️',
    title: { fr: 'Chasses au trésor', en: 'Treasure hunts' },
    intro: {
      fr: 'Un Lord poste une énigme. Le premier à trouver la bonne réponse rafle la récompense en PULSE. Vitesse compte.',
      en: 'A Lord posts a riddle. First to guess right takes the PULSE reward. Speed matters.',
    },
    commands: [
      { fr: '/hunt list — voir les chasses actives', en: '/hunt list — see active hunts' },
      { fr: '/hunt solve id: answer: — donner ta réponse', en: '/hunt solve id: answer: — submit your answer' },
    ],
    tips: {
      fr: 'La réponse est comparée sans accents ni ponctuation — pas besoin d\'écrire "à" ou "è" exactement.',
      en: 'Answers are matched without accents or punctuation — no need to type "à" or "è" exactly.',
    },
  },
  guilds: {
    emoji: '🏰',
    title: { fr: 'Guildes', en: 'Guilds' },
    intro: {
      fr: 'Rejoins une guilde (max 20 membres) pour cumuler du XP collectif et débloquer des bonus. Ou crée la tienne pour 2000 PULSE.',
      en: 'Join a guild (up to 20 members) to pool collective XP and unlock bonuses. Or create your own for 2000 PULSE.',
    },
    commands: [
      { fr: '/guild list — voir les guildes existantes', en: '/guild list — browse guilds' },
      { fr: '/guild join tag: — rejoindre par tag', en: '/guild join tag: — join by tag' },
      { fr: '/guild create name: tag: — créer la tienne', en: '/guild create name: tag: — create yours' },
      { fr: '/guild view — voir ta guilde', en: '/guild view — see your guild' },
      { fr: '/guild donate amount: — donner du PULSE à la guilde', en: '/guild donate amount: — donate PULSE to the guild' },
    ],
  },
  events: {
    emoji: '📅',
    title: { fr: 'Calendrier des événements', en: 'Server events calendar' },
    intro: {
      fr: 'Les Lords programment des événements (tournois, streams, ateliers…). Tu RSVPes en un clic et tu reçois un rappel 15 min avant.',
      en: 'Lords schedule events (tournaments, streams, workshops…). One-tap RSVP + you get a 15 min reminder before.',
    },
    commands: [
      { fr: '/event list — voir les prochains événements', en: '/event list — upcoming events' },
      { fr: '/event rsvp id: going/maybe/no — répondre', en: '/event rsvp id: going/maybe/no — RSVP' },
      { fr: '/event view id: — détails d\'un event', en: '/event view id: — event details' },
    ],
  },
  marriage: {
    emoji: '💒',
    title: { fr: 'Mariages', en: 'Marriages' },
    intro: {
      fr: 'Fiance-toi à un·e autre membre pour 500 PULSE (bague). Iel doit accepter. Divorce à 200 PULSE.',
      en: 'Propose to another member for 500 PULSE (the ring). They must accept. Divorce fee is 200 PULSE.',
    },
    commands: [
      { fr: '/marriage propose @user message: — demande en mariage', en: '/marriage propose @user message: — propose' },
      { fr: '/marriage status — voir ton statut', en: '/marriage status — see your status' },
      { fr: '/marriage divorce — quitter', en: '/marriage divorce — leave' },
    ],
  },
  bank: {
    emoji: '🏦',
    title: { fr: 'Banque & Prêts', en: 'Bank & Loans' },
    intro: {
      fr: 'Épargne : 1% d\'intérêt par semaine. Prêt entre membres : 5% d\'intérêt, durée 1 à 30 jours. Le PULSE dort chez toi si tu le gères mal.',
      en: 'Savings: 1% interest per week. Peer loans: 5% interest, 1 to 30 day term. PULSE sits idle if you don\'t manage it.',
    },
    commands: [
      { fr: '/bank deposit amount: — déposer', en: '/bank deposit amount: — deposit' },
      { fr: '/bank withdraw amount: — retirer', en: '/bank withdraw amount: — withdraw' },
      { fr: '/bank balance — voir ton compte', en: '/bank balance — check your account' },
      { fr: '/bank lend @user amount: days: — prêter', en: '/bank lend @user amount: days: — lend' },
      { fr: '/bank repay id: — rembourser', en: '/bank repay id: — repay' },
    ],
  },
  birthday: {
    emoji: '🎂',
    title: { fr: 'Anniversaires', en: 'Birthdays' },
    intro: {
      fr: 'Enregistre ta date, et le jour venu le bot le célèbre dans le serveur + t\'envoie +500 PULSE. Une seule fois par an.',
      en: 'Register your date, and on the day the bot celebrates you in the server + sends you +500 PULSE. Once a year.',
    },
    commands: [
      { fr: '/birthday set day: month: — enregistrer ta date', en: '/birthday set day: month: — set your date' },
      { fr: '/birthday view — voir la date enregistrée', en: '/birthday view — see saved date' },
      { fr: '/birthday remove — la retirer', en: '/birthday remove — remove it' },
    ],
  },
  stream: {
    emoji: '🎥',
    title: { fr: 'Streams — Twitch / YouTube / X', en: 'Streaming — Twitch / YouTube / X' },
    intro: {
      fr: 'Lie ton compte de streaming et le bot annonce automatiquement quand tu passes en direct. Marche aussi avec /stream golive pour X, TikTok, ou n\'importe quel service.',
      en: 'Link your streaming account and the bot auto-announces when you go live. Also works via /stream golive for X, TikTok, or any service.',
    },
    commands: [
      { fr: '/stream link platform: handle: — lier ton compte', en: '/stream link platform: handle: — link your account' },
      { fr: '/stream golive url: title: — annoncer manuellement', en: '/stream golive url: title: — announce manually' },
      { fr: '/stream me — voir tes liens', en: '/stream me — see your links' },
      { fr: '/stream list — tous les streamers du serveur', en: '/stream list — every streamer on the server' },
    ],
  },
};

async function activeCounts() {
  const [sagas, hunts, events] = await Promise.all([
    supabase.from('sagas').select('id', { count: 'exact', head: true }).eq('status', 'running'),
    supabase.from('treasure_hunts').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('server_events').select('id', { count: 'exact', head: true }).eq('status', 'scheduled'),
  ]);
  return {
    sagas: sagas.count ?? 0,
    hunts: hunts.count ?? 0,
    events: events.count ?? 0,
  };
}

export default async function FeaturesPage({ searchParams }: { searchParams: { f?: string } }) {
  const session = getSession();
  if (!session) redirect('/');
  const locale = getLocale();
  const fr = locale === 'fr';
  const f = (searchParams.f ?? '') as Feature;
  const focus = CONTENT[f];
  const counts = await activeCounts();

  return (
    <>
      <Link href="/app" className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold mb-3">
        <span className="text-lg leading-none">‹</span><span>{fr ? 'Retour au hub' : 'Back to hub'}</span>
      </Link>
      <h1 className="text-2xl font-bold mb-1">✨ {fr ? 'Toutes les fonctionnalités' : 'All features'}</h1>
      <p className="text-pulse-mute text-sm mb-4">
        {fr ? 'Tape sur une carte pour voir ses commandes Discord.' : 'Tap a card to see its Discord commands.'}
      </p>

      {focus && (
        <div className="mb-4 rounded-2xl border border-pulse-gold/40 bg-pulse-gold/10 p-4">
          <div className="text-4xl mb-2">{focus.emoji}</div>
          <div className="text-lg font-bold">{focus.title[fr ? 'fr' : 'en']}</div>
          <p className="text-pulse-mute text-sm mt-2">{focus.intro[fr ? 'fr' : 'en']}</p>
          <div className="mt-3 space-y-1">
            {focus.commands.map((c, i) => (
              <div key={i} className="text-xs font-mono bg-black/40 rounded px-2 py-1">
                {c[fr ? 'fr' : 'en']}
              </div>
            ))}
          </div>
          {focus.tips && (
            <div className="mt-3 text-[11px] italic text-pulse-mute">💡 {focus.tips[fr ? 'fr' : 'en']}</div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {(Object.entries(CONTENT) as [Feature, FeatureContent][]).map(([key, c]) => {
          const badge = key === 'sagas' ? counts.sagas : key === 'hunt' ? counts.hunts : key === 'events' ? counts.events : null;
          return (
            <Link
              key={key}
              href={`/app/features?f=${key}`}
              className={`group relative bg-pulse-card border rounded-2xl overflow-hidden active:scale-[0.98] transition-all ${
                key === f ? 'border-pulse-gold' : 'border-pulse-border hover:border-pulse-gold/50'
              }`}
            >
              <div className="relative flex items-start gap-3 p-4">
                <div className="text-3xl leading-none shrink-0">{c.emoji}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm truncate">{c.title[fr ? 'fr' : 'en']}</div>
                  <div className="text-[11px] text-pulse-mute mt-0.5 line-clamp-2">
                    {c.intro[fr ? 'fr' : 'en']}
                  </div>
                </div>
                {badge !== null && badge > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-pulse-gold/20 text-pulse-gold font-mono">
                    {badge}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
