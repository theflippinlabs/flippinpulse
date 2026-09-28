import { getSession, isAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getPublicLocale } from '@/lib/publicLocale';
import { LanguageSwitch } from './LanguageSwitch';

const ERRORS: Record<string, { en: string; fr: string }> = {
  missing_code: { en: 'Discord did not send back a code. Try again.', fr: 'Discord n\'a pas renvoyé de code. Réessaie.' },
  token_exchange: { en: 'Discord refused the token exchange. Check your client secret.', fr: 'Discord a refusé l\'échange de token. Vérifie ton client secret.' },
  userinfo: { en: 'Could not fetch your Discord identity.', fr: 'Impossible de récupérer ton identité Discord.' },
  not_admin: { en: 'Your Discord account is not on the allowlist. Ask a Lord to add your ID.', fr: 'Ton compte Discord n\'est pas sur l\'allowlist. Demande à un Lord d\'ajouter ton ID.' },
  oauth_not_configured: { en: 'The dashboard is missing DISCORD_CLIENT_ID / SECRET / REDIRECT_URI.', fr: 'Le dashboard n\'a pas de DISCORD_CLIENT_ID / SECRET / REDIRECT_URI configurés.' },
};

const COPY = {
  en: {
    navFeatures: 'Features',
    navPricing: 'Pricing',
    navFaq: 'FAQ',
    signIn: 'Sign in',
    heroKicker: 'AI community platform · powered by Discord',
    heroLine1: 'Your Discord server,',
    heroLine2: 'alive 24/7.',
    heroDesc: 'Novarys turns your community into a game. AI moderation, a seasonal Battle Pass, trading cards with PvP duels, adoptable pets, live stream alerts, and a full web dashboard — everything runs from your server without you lifting a finger.',
    ctaSignIn: 'Sign in with Discord',
    ctaSeePlans: 'See plans',
    ctaBadge: 'Free plan available · No credit card to start · Cancel anytime',
    featuresTitle: 'Everything a modern community needs',
    featuresSub: 'One bot, one dashboard, one economy. No juggling five different tools.',
    pricingTitle: 'Simple pricing, no lock-in',
    pricingSub: 'Start free. Upgrade only when your community wants more.',
    mostPopular: 'Most popular',
    faqTitle: 'FAQ',
    ctaTitle: 'Bring Novarys to your server today',
    ctaSub: 'Sign in with Discord, pick a plan, and Novus wakes up in your community.',
    ctaButton: 'Sign in with Discord →',
    footerPrivacy: 'Privacy',
    footerTerms: 'Terms',
    footerContact: 'Contact',
    perMonth: '/month',
    features: [
      { icon: '🤖', title: 'Novus, your AI community manager', desc: 'Adaptive welcome messages, AI-powered automod that reads context (not just keywords), a personal AI companion each member can chat with, weekly community reports written for the admin.' },
      { icon: '⚡', title: 'PULSE economy', desc: 'A daemon currency that rewards messages, streaks, wins and events. Full shop, transfers, gifts, birthdays and bank loans built in — atomic transactions, zero double-spend.' },
      { icon: '🏆', title: 'Seasonal Battle Pass', desc: '100 levels, XP from every activity, free + premium tracks, cosmetic rewards, roles, PULSE payouts. Auto-managed seasons with countdown and end-of-season announcements.' },
      { icon: '🃏', title: 'Trading cards + duels', desc: 'Collectible cards with rarities, characters, equipment (weapons/shields/spells), fusion, upgrades, and PvP duels playable in Discord OR on the web dashboard.' },
      { icon: '🐾', title: 'Adoptable pets', desc: 'Members adopt, name, feed, train, dress up and duel pets. Growth stats, moods, cosmetic skins. Loot-lite gameplay that pulls people back every day.' },
      { icon: '📖', title: 'Multi-day narrative sagas', desc: 'Admin-authored quests spanning multiple days with riddles, chapter rewards and a final bonus. Novus can even write chapter clues from a synopsis.' },
      { icon: '🎮', title: 'Casino & mini-games', desc: 'Blackjack, roulette, slots, coinflip, higher-or-lower, chicken race, lottery, Texas Hold\'em, treasure hunts. All PULSE-based, all built in.' },
      { icon: '💒', title: 'Social layer', desc: 'Marriages, guilds with shared PULSE bank, gifts, birthdays with automatic PULSE showers, tournaments — the fabric that makes a Discord feel like a home.' },
      { icon: '🔴', title: 'Live stream alerts', desc: 'Auto-detected lives on Twitch, YouTube, and X Spaces. Manual "I\'m live" for TikTok / Kick / X video / anything else. One embed in your alert channel, one ping to the fan role.' },
      { icon: '📊', title: 'Full web dashboard', desc: 'A modern web app your Lord and members can open on any device. Everything the bot exposes lives on the web too — cards, pets, battle pass, shop, companion.' },
      { icon: '🔔', title: 'Push notifications', desc: 'Web push to phone or desktop for events that matter — pet challenges, saga chapters, live alerts, tournaments. VAPID-based, no third-party tracker.' },
      { icon: '🌍', title: 'Bilingual FR/EN', desc: 'Every command, every embed, every dashboard page. Each member picks their language — the bot answers back in the right one.' },
    ],
    plans: [
      { name: 'Free', price: '€0', per: '', tagline: 'For a small server that wants to test the water.',
        features: ['PULSE economy + shop core', 'All classic mini-games', 'Basic moderation', '1 Discord server', 'Community support'],
        ctaLabel: 'Get started', highlight: false },
      { name: 'Starter', price: '€29', per: '/month', tagline: 'The active-community starter kit.',
        features: ['Everything in Free', 'Seasonal Battle Pass', 'AI-powered automod', 'Custom shop items', 'Email support'],
        ctaLabel: 'Choose Starter', highlight: false },
      { name: 'Pro', price: '€79', per: '/month', tagline: 'For serious communities. Everything unlocked.',
        features: ['Everything in Starter', 'Pets + Trading cards + PvP', 'AI companion (per member)', 'Multi-day sagas', 'Live stream alerts', 'Weekly AI analytics', 'Priority support'],
        ctaLabel: 'Choose Pro', highlight: true },
      { name: 'Enterprise', price: 'Custom', per: '', tagline: 'Multi-server, white-label, custom features.',
        features: ['Everything in Pro', 'Multi-server management', 'White-label branding', 'Custom AI persona', 'Dedicated onboarding', 'SLA + priority roadmap'],
        ctaLabel: 'Contact us', highlight: false },
    ],
    faqs: [
      { q: 'Do my members need to install anything?', a: 'No. They just use Discord normally. Novus reacts to messages, hands out PULSE, and posts embeds. The web dashboard is optional — everything works from Discord alone.' },
      { q: 'What happens to my server if I downgrade or cancel?', a: 'Nothing is lost. Your Discord stays exactly as it is. Only the plan-locked features (Pets, Cards, AI companion, etc.) become unavailable until you upgrade again. All PULSE balances, member XP, and history are kept safe.' },
      { q: 'Is PULSE real money?', a: 'No. PULSE is a purely in-server currency with zero monetary value. It cannot be cashed out, exchanged, or refunded. Everything is entertainment — no gambling regulation applies.' },
      { q: 'How is my data handled?', a: 'We only store what the bot needs to work: Discord IDs, PULSE balances, activity counts, and companion messages you send. Data lives in EU-hosted Supabase, encrypted at rest. Details in our Privacy Policy.' },
      { q: 'Does the AI companion learn from private messages?', a: 'No. Each companion has a 30-message rolling memory scoped to one user. Conversations are never used for training, never shared, and can be wiped at any time with `/compagnon delete`.' },
      { q: 'Do I need coding to configure Novarys?', a: 'Zero code. Everything — welcome messages, shop items, automod rules, seasons, sagas — is edited from the web dashboard with normal forms and toggles.' },
      { q: 'Can I try Pro before paying?', a: 'Yes — get in touch and we\'ll enable a 14-day trial on Pro for your server.' },
    ],
  },
  fr: {
    navFeatures: 'Fonctionnalités',
    navPricing: 'Tarifs',
    navFaq: 'FAQ',
    signIn: 'Se connecter',
    heroKicker: 'Plateforme communautaire IA · propulsée par Discord',
    heroLine1: 'Ton serveur Discord,',
    heroLine2: 'vivant 24/7.',
    heroDesc: 'Novarys transforme ta communauté en jeu. Modération IA, Battle Pass saisonnier, cartes à collectionner avec duels PvP, pets adoptables, alertes de live, et un dashboard web complet — tout tourne depuis ton serveur sans que tu lèves le petit doigt.',
    ctaSignIn: 'Se connecter avec Discord',
    ctaSeePlans: 'Voir les plans',
    ctaBadge: 'Plan gratuit dispo · Aucune carte requise · Annulable à tout moment',
    featuresTitle: 'Tout ce qu\'une communauté moderne attend',
    featuresSub: 'Un bot, un dashboard, une économie. Fini de jongler entre cinq outils.',
    pricingTitle: 'Tarifs simples, sans engagement',
    pricingSub: 'Commence gratuitement. Passe à un plan payant quand ta communauté en veut plus.',
    mostPopular: 'Le plus populaire',
    faqTitle: 'FAQ',
    ctaTitle: 'Installe Novarys sur ton serveur dès aujourd\'hui',
    ctaSub: 'Connecte-toi avec Discord, choisis un plan, et Novus se réveille dans ta communauté.',
    ctaButton: 'Se connecter avec Discord →',
    footerPrivacy: 'Confidentialité',
    footerTerms: 'CGU',
    footerContact: 'Contact',
    perMonth: '/mois',
    features: [
      { icon: '🤖', title: 'Novus, ton community manager IA', desc: 'Messages de bienvenue adaptatifs, automod IA qui lit le contexte (pas juste des mots-clés), compagnon IA personnel pour chaque membre, rapports hebdo écrits pour l\'admin.' },
      { icon: '⚡', title: 'Économie PULSE', desc: 'Une monnaie qui récompense les messages, streaks, victoires et événements. Shop, transferts, cadeaux, anniversaires et prêts bancaires intégrés — transactions atomiques, zéro double-dépense.' },
      { icon: '🏆', title: 'Battle Pass saisonnier', desc: '100 niveaux, XP sur toute activité, tracks gratuit + premium, récompenses cosmétiques, rôles, PULSE. Saisons auto-gérées avec compte à rebours et annonces de fin.' },
      { icon: '🃏', title: 'Cartes à collectionner + duels', desc: 'Cartes avec raretés, personnages, équipements (armes / boucliers / sorts), fusion, upgrades, et duels PvP jouables dans Discord OU sur le dashboard.' },
      { icon: '🐾', title: 'Pets adoptables', desc: 'Les membres adoptent, nomment, nourrissent, entraînent, habillent et font combattre leur pet. Stats, humeurs, skins cosmétiques. Un loop de jeu qui les ramène chaque jour.' },
      { icon: '📖', title: 'Sagas narratives multi-jours', desc: 'Quêtes écrites par l\'admin s\'étalant sur plusieurs jours avec énigmes, récompenses par chapitre et bonus final. Novus peut même rédiger les indices à partir d\'un synopsis.' },
      { icon: '🎮', title: 'Casino & mini-jeux', desc: 'Blackjack, roulette, machines à sous, coinflip, higher-or-lower, chicken race, loterie, Texas Hold\'em, chasses au trésor. Tout en PULSE, tout intégré.' },
      { icon: '💒', title: 'Couche sociale', desc: 'Mariages, guildes avec banque PULSE partagée, cadeaux, anniversaires avec pluie de PULSE, tournois — le tissu qui rend un Discord chaleureux.' },
      { icon: '🔴', title: 'Alertes de live', desc: 'Détection auto sur Twitch, YouTube et X Spaces. Bouton manuel "je suis en live" pour TikTok / Kick / X video / autre. Un embed dans le canal d\'alerte, un ping au rôle fan.' },
      { icon: '📊', title: 'Dashboard web complet', desc: 'Une web app moderne que ton Lord et tes membres peuvent ouvrir sur n\'importe quel device. Tout ce que fait le bot est aussi jouable sur le web.' },
      { icon: '🔔', title: 'Notifications push', desc: 'Push web sur téléphone ou desktop pour les événements importants — défis de pets, chapitres de saga, alertes live, tournois. Basé sur VAPID, aucun tracker tiers.' },
      { icon: '🌍', title: 'Bilingue FR/EN', desc: 'Chaque commande, chaque embed, chaque page du dashboard. Chaque membre choisit sa langue — le bot répond dans la bonne.' },
    ],
    plans: [
      { name: 'Free', price: '0 €', per: '', tagline: 'Pour un petit serveur qui veut tester l\'eau.',
        features: ['Économie PULSE + shop de base', 'Tous les mini-jeux classiques', 'Modération de base', '1 serveur Discord', 'Support communautaire'],
        ctaLabel: 'Commencer', highlight: false },
      { name: 'Starter', price: '29 €', per: '/mois', tagline: 'Le kit de démarrage pour communauté active.',
        features: ['Tout ce qui est dans Free', 'Battle Pass saisonnier', 'Automod IA', 'Shop personnalisable', 'Support par email'],
        ctaLabel: 'Choisir Starter', highlight: false },
      { name: 'Pro', price: '79 €', per: '/mois', tagline: 'Pour les communautés sérieuses. Tout débloqué.',
        features: ['Tout ce qui est dans Starter', 'Pets + Cartes + PvP', 'Compagnon IA (par membre)', 'Sagas multi-jours', 'Alertes de live', 'Analytics IA hebdo', 'Support prioritaire'],
        ctaLabel: 'Choisir Pro', highlight: true },
      { name: 'Enterprise', price: 'Sur devis', per: '', tagline: 'Multi-serveur, white-label, fonctionnalités custom.',
        features: ['Tout ce qui est dans Pro', 'Gestion multi-serveur', 'Marque blanche', 'Persona IA custom', 'Onboarding dédié', 'SLA + priorité sur la roadmap'],
        ctaLabel: 'Nous contacter', highlight: false },
    ],
    faqs: [
      { q: 'Mes membres doivent installer quelque chose ?', a: 'Non. Ils utilisent Discord normalement. Novus réagit aux messages, distribue du PULSE, poste des embeds. Le dashboard web est optionnel — tout fonctionne depuis Discord seul.' },
      { q: 'Que devient mon serveur si je downgrade ou annule ?', a: 'Rien n\'est perdu. Ton Discord reste exactement comme il est. Seules les fonctionnalités payantes (Pets, Cartes, Compagnon IA, etc.) deviennent indisponibles jusqu\'à ce que tu réactives. Tous les soldes PULSE, XP des membres et historique sont conservés.' },
      { q: 'Est-ce que PULSE est de l\'argent réel ?', a: 'Non. PULSE est une monnaie purement interne au serveur, sans aucune valeur monétaire. Elle ne peut être ni encaissée, ni échangée, ni remboursée. Tout est du divertissement — aucune réglementation sur les jeux d\'argent ne s\'applique.' },
      { q: 'Comment mes données sont-elles gérées ?', a: 'On stocke seulement ce dont le bot a besoin : IDs Discord, soldes PULSE, activité, messages envoyés au compagnon. Les données vivent sur Supabase hébergé en UE, chiffrées au repos. Détails dans notre politique de confidentialité.' },
      { q: 'Le compagnon IA apprend-il de mes messages privés ?', a: 'Non. Chaque compagnon a une mémoire glissante de 30 messages liée à un seul utilisateur. Les conversations ne servent jamais à l\'entraînement, ne sont jamais partagées, et peuvent être effacées à tout moment avec `/compagnon delete`.' },
      { q: 'Faut-il coder pour configurer Novarys ?', a: 'Zéro code. Tout — messages de bienvenue, items du shop, règles automod, saisons, sagas — se configure depuis le dashboard web avec des formulaires et des toggles.' },
      { q: 'Puis-je essayer Pro avant de payer ?', a: 'Oui — contacte-nous et on active un essai gratuit de 14 jours sur Pro pour ton serveur.' },
    ],
  },
} as const;

export default function Landing({ searchParams }: { searchParams: { error?: string } }) {
  const session = getSession();
  if (session) redirect(isAdmin(session.id) ? '/dashboard' : '/app');
  const locale = getPublicLocale();
  const c = COPY[locale];
  const err = searchParams.error ? ERRORS[searchParams.error]?.[locale] ?? (locale === 'fr' ? 'Connexion échouée.' : 'Login failed.') : null;

  return (
    <main className="min-h-screen text-pulse-text">
      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-pulse-border bg-black/70 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold tracking-wider">
            <span className="text-pulse-gold text-xl">⚡</span>
            <span>NOVARYS <span className="text-pulse-gold">//</span> PULSE</span>
          </div>
          <nav className="hidden sm:flex items-center gap-6 text-sm text-pulse-mute">
            <a href="#features" className="hover:text-pulse-gold">{c.navFeatures}</a>
            <a href="#pricing" className="hover:text-pulse-gold">{c.navPricing}</a>
            <a href="#faq" className="hover:text-pulse-gold">{c.navFaq}</a>
          </nav>
          <div className="flex items-center gap-3">
            <LanguageSwitch current={locale} />
            <a
              href="/api/auth/login"
              className="text-sm px-4 py-2 rounded-lg bg-pulse-gold text-black font-semibold hover:opacity-90"
            >
              {c.signIn}
            </a>
          </div>
        </div>
      </header>

      {err && (
        <div className="max-w-6xl mx-auto px-6 mt-4">
          <div className="p-3 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-sm">
            {err}
          </div>
        </div>
      )}

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[500px] bg-brand-glow pointer-events-none" />
        <div className="max-w-6xl mx-auto px-6 py-24 sm:py-32 relative">
          <p className="text-pulse-gold text-sm uppercase tracking-widest mb-4">
            {c.heroKicker}
          </p>
          <h1 className="text-4xl sm:text-6xl font-bold leading-tight max-w-3xl">
            {c.heroLine1}
            <br />
            <span className="brand-text">{c.heroLine2}</span>
          </h1>
          <p className="mt-6 text-lg text-pulse-mute max-w-2xl leading-relaxed">
            {c.heroDesc}
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3">
            <a
              href="/api/auth/login"
              className="text-center px-6 py-3 rounded-lg bg-pulse-gold text-black font-semibold hover:opacity-90 shadow-brand"
            >
              {c.ctaSignIn}
            </a>
            <a
              href="#pricing"
              className="text-center px-6 py-3 rounded-lg border border-pulse-border hover:border-pulse-gold text-pulse-text"
            >
              {c.ctaSeePlans}
            </a>
          </div>
          <p className="mt-4 text-xs text-pulse-mute">{c.ctaBadge}</p>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="border-t border-pulse-border">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
            {c.featuresTitle}
          </h2>
          <p className="text-center text-pulse-mute max-w-2xl mx-auto mb-16">
            {c.featuresSub}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {c.features.map((f) => (
              <div
                key={f.title}
                className="p-6 rounded-2xl bg-pulse-card border border-pulse-border hover:border-pulse-gold/50 transition-colors bg-card-glow"
              >
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-pulse-mute leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="border-t border-pulse-border bg-pulse-card/30">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
            {c.pricingTitle}
          </h2>
          <p className="text-center text-pulse-mute mb-16">{c.pricingSub}</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {c.plans.map((p) => (
              <div
                key={p.name}
                className={`p-6 rounded-2xl border ${
                  p.highlight
                    ? 'border-pulse-gold shadow-brand bg-pulse-card'
                    : 'border-pulse-border bg-pulse-card'
                }`}
              >
                {p.highlight && (
                  <div className="text-xs uppercase tracking-wider text-pulse-gold mb-2">
                    {c.mostPopular}
                  </div>
                )}
                <h3 className="text-xl font-bold">{p.name}</h3>
                <div className="mt-2 mb-4">
                  <span className="text-3xl font-bold">{p.price}</span>
                  {p.per && <span className="text-pulse-mute text-sm"> {p.per}</span>}
                </div>
                <p className="text-sm text-pulse-mute mb-4">{p.tagline}</p>
                <ul className="space-y-2 text-sm mb-6">
                  {p.features.map((feat) => (
                    <li key={feat} className="flex gap-2">
                      <span className="text-pulse-gold">✓</span>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={p.name === 'Enterprise' ? 'mailto:theflippinlabs@gmail.com' : '/api/auth/login'}
                  className={`block text-center px-4 py-2 rounded-lg font-semibold text-sm ${
                    p.highlight
                      ? 'bg-pulse-gold text-black hover:opacity-90'
                      : 'border border-pulse-border hover:border-pulse-gold'
                  }`}
                >
                  {p.ctaLabel}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-pulse-border">
        <div className="max-w-3xl mx-auto px-6 py-24">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">{c.faqTitle}</h2>
          <div className="space-y-4">
            {c.faqs.map((f) => (
              <details
                key={f.q}
                className="p-5 rounded-xl border border-pulse-border bg-pulse-card open:border-pulse-gold/50"
              >
                <summary className="cursor-pointer font-semibold flex items-center justify-between">
                  {f.q}
                  <span className="text-pulse-gold">+</span>
                </summary>
                <p className="mt-3 text-sm text-pulse-mute leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-pulse-border">
        <div className="max-w-4xl mx-auto px-6 py-24 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">{c.ctaTitle}</h2>
          <p className="text-pulse-mute mb-8">{c.ctaSub}</p>
          <a
            href="/api/auth/login"
            className="inline-block px-8 py-4 rounded-lg bg-pulse-gold text-black font-semibold hover:opacity-90 shadow-brand"
          >
            {c.ctaButton}
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-pulse-border">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-pulse-mute">
          <div>© {new Date().getFullYear()} The Flippin&apos; Labs — Novarys</div>
          <div className="flex items-center gap-6">
            <Link href="/legal/privacy" className="hover:text-pulse-gold">
              {c.footerPrivacy}
            </Link>
            <Link href="/legal/terms" className="hover:text-pulse-gold">
              {c.footerTerms}
            </Link>
            <a href="mailto:theflippinlabs@gmail.com" className="hover:text-pulse-gold">
              {c.footerContact}
            </a>
            <LanguageSwitch current={locale} />
          </div>
        </div>
      </footer>
    </main>
  );
}
