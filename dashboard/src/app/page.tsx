import { getSession, isAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';

const ERRORS: Record<string, string> = {
  missing_code: 'Discord did not send back a code. Try again.',
  token_exchange: 'Discord refused the token exchange. Check your client secret.',
  userinfo: 'Could not fetch your Discord identity.',
  not_admin: 'Your Discord account is not on the allowlist. Ask a Lord to add your ID.',
  oauth_not_configured: 'The dashboard is missing DISCORD_CLIENT_ID / SECRET / REDIRECT_URI.',
};

export default function Landing({ searchParams }: { searchParams: { error?: string } }) {
  const session = getSession();
  if (session) redirect(isAdmin(session.id) ? '/dashboard' : '/app');
  const err = searchParams.error ? ERRORS[searchParams.error] ?? 'Login failed.' : null;

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
            <a href="#features" className="hover:text-pulse-gold">Features</a>
            <a href="#pricing" className="hover:text-pulse-gold">Pricing</a>
            <a href="#faq" className="hover:text-pulse-gold">FAQ</a>
          </nav>
          <a
            href="/api/auth/login"
            className="text-sm px-4 py-2 rounded-lg bg-pulse-gold text-black font-semibold hover:opacity-90"
          >
            Sign in
          </a>
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
            AI community platform · powered by Discord
          </p>
          <h1 className="text-4xl sm:text-6xl font-bold leading-tight max-w-3xl">
            Your Discord server,
            <br />
            <span className="brand-text">alive 24/7.</span>
          </h1>
          <p className="mt-6 text-lg text-pulse-mute max-w-2xl leading-relaxed">
            Novarys turns your community into a game. AI moderation, a seasonal Battle Pass,
            trading cards with PvP duels, adoptable pets, live stream alerts, and a full web
            dashboard — everything runs from your server without you lifting a finger.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3">
            <a
              href="/api/auth/login"
              className="text-center px-6 py-3 rounded-lg bg-pulse-gold text-black font-semibold hover:opacity-90 shadow-brand"
            >
              Sign in with Discord
            </a>
            <a
              href="#pricing"
              className="text-center px-6 py-3 rounded-lg border border-pulse-border hover:border-pulse-gold text-pulse-text"
            >
              See plans
            </a>
          </div>
          <p className="mt-4 text-xs text-pulse-mute">
            Free plan available · No credit card to start · Cancel anytime
          </p>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="border-t border-pulse-border">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
            Everything a modern community needs
          </h2>
          <p className="text-center text-pulse-mute max-w-2xl mx-auto mb-16">
            One bot, one dashboard, one economy. No juggling five different tools.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
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
            Simple pricing, no lock-in
          </h2>
          <p className="text-center text-pulse-mute mb-16">
            Start free. Upgrade only when your community wants more.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {PLANS.map((p) => (
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
                    Most popular
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
                  href={p.cta.href}
                  className={`block text-center px-4 py-2 rounded-lg font-semibold text-sm ${
                    p.highlight
                      ? 'bg-pulse-gold text-black hover:opacity-90'
                      : 'border border-pulse-border hover:border-pulse-gold'
                  }`}
                >
                  {p.cta.label}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-pulse-border">
        <div className="max-w-3xl mx-auto px-6 py-24">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">FAQ</h2>
          <div className="space-y-4">
            {FAQS.map((f) => (
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
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Bring Novarys to your server today
          </h2>
          <p className="text-pulse-mute mb-8">
            Sign in with Discord, pick a plan, and Novus wakes up in your community.
          </p>
          <a
            href="/api/auth/login"
            className="inline-block px-8 py-4 rounded-lg bg-pulse-gold text-black font-semibold hover:opacity-90 shadow-brand"
          >
            Sign in with Discord →
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-pulse-border">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-pulse-mute">
          <div>© {new Date().getFullYear()} The Flippin&apos; Labs — Novarys</div>
          <div className="flex gap-6">
            <Link href="/legal/privacy" className="hover:text-pulse-gold">
              Privacy
            </Link>
            <Link href="/legal/terms" className="hover:text-pulse-gold">
              Terms
            </Link>
            <a href="mailto:theflippinlabs@gmail.com" className="hover:text-pulse-gold">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}

const FEATURES = [
  {
    icon: '🤖',
    title: 'Novus, your AI community manager',
    desc: 'Adaptive welcome messages, AI-powered automod that reads context (not just keywords), a personal AI companion each member can chat with, weekly community reports written for the admin.',
  },
  {
    icon: '⚡',
    title: 'PULSE economy',
    desc: 'A daemon currency that rewards messages, streaks, wins and events. Full shop, transfers, gifts, birthdays and bank loans built in — atomic transactions, zero double-spend.',
  },
  {
    icon: '🏆',
    title: 'Seasonal Battle Pass',
    desc: '100 levels, XP from every activity, free + premium tracks, cosmetic rewards, roles, PULSE payouts. Auto-managed seasons with countdown and end-of-season announcements.',
  },
  {
    icon: '🃏',
    title: 'Trading cards + duels',
    desc: 'Collectible cards with rarities, characters, equipment (weapons/shields/spells), fusion, upgrades, and PvP duels playable in Discord OR on the web dashboard.',
  },
  {
    icon: '🐾',
    title: 'Adoptable pets',
    desc: 'Members adopt, name, feed, train, dress up and duel pets. Growth stats, moods, cosmetic skins. Loot-lite gameplay that pulls people back every day.',
  },
  {
    icon: '📖',
    title: 'Multi-day narrative sagas',
    desc: 'Admin-authored quests spanning multiple days with riddles, chapter rewards and a final bonus. Novus can even write chapter clues from a synopsis.',
  },
  {
    icon: '🎮',
    title: 'Casino & mini-games',
    desc: 'Blackjack, roulette, slots, coinflip, higher-or-lower, chicken race, lottery, Texas Hold\'em, treasure hunts. All PULSE-based, all built in.',
  },
  {
    icon: '💒',
    title: 'Social layer',
    desc: 'Marriages, guilds with shared PULSE bank, gifts, birthdays with automatic PULSE showers, tournaments — the fabric that makes a Discord feel like a home.',
  },
  {
    icon: '🔴',
    title: 'Live stream alerts',
    desc: 'Auto-detected lives on Twitch, YouTube, and X Spaces. Manual "I\'m live" for TikTok / Kick / X video / anything else. One embed in your alert channel, one ping to the fan role.',
  },
  {
    icon: '📊',
    title: 'Full web dashboard',
    desc: 'A modern web app your Lord and members can open on any device. Everything the bot exposes lives on the web too — cards, pets, battle pass, shop, companion.',
  },
  {
    icon: '🔔',
    title: 'Push notifications',
    desc: 'Web push to phone or desktop for events that matter — pet challenges, saga chapters, live alerts, tournaments. VAPID-based, no third-party tracker.',
  },
  {
    icon: '🌍',
    title: 'Bilingual FR/EN',
    desc: 'Every command, every embed, every dashboard page. Each member picks their language — the bot answers back in the right one.',
  },
];

const PLANS = [
  {
    name: 'Free',
    price: '0 €',
    per: '',
    tagline: 'For a small server that wants to test the water.',
    features: [
      'PULSE economy + shop core',
      'All classic mini-games',
      'Basic moderation',
      '1 Discord server',
      'Community support',
    ],
    cta: { label: 'Get started', href: '/api/auth/login' },
    highlight: false,
  },
  {
    name: 'Starter',
    price: '29 €',
    per: '/month',
    tagline: 'The active-community starter kit.',
    features: [
      'Everything in Free',
      'Seasonal Battle Pass',
      'AI-powered automod',
      'Custom shop items',
      'Email support',
    ],
    cta: { label: 'Choose Starter', href: '/api/auth/login' },
    highlight: false,
  },
  {
    name: 'Pro',
    price: '79 €',
    per: '/month',
    tagline: 'For serious communities. Everything unlocked.',
    features: [
      'Everything in Starter',
      'Pets + Trading cards + PvP',
      'AI companion (per member)',
      'Multi-day sagas',
      'Live stream alerts',
      'Weekly AI analytics',
      'Priority support',
    ],
    cta: { label: 'Choose Pro', href: '/api/auth/login' },
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    per: '',
    tagline: 'Multi-server, white-label, custom features.',
    features: [
      'Everything in Pro',
      'Multi-server management',
      'White-label branding',
      'Custom AI persona',
      'Dedicated onboarding',
      'SLA + priority roadmap',
    ],
    cta: { label: 'Contact us', href: 'mailto:theflippinlabs@gmail.com' },
    highlight: false,
  },
];

const FAQS = [
  {
    q: 'Do my members need to install anything?',
    a: 'No. They just use Discord normally. Novus reacts to messages, hands out PULSE, and posts embeds. The web dashboard is optional — everything works from Discord alone.',
  },
  {
    q: 'What happens to my server if I downgrade or cancel?',
    a: 'Nothing is lost. Your Discord stays exactly as it is. Only the plan-locked features (Pets, Cards, AI companion, etc.) become unavailable until you upgrade again. All PULSE balances, member XP, and history are kept safe.',
  },
  {
    q: 'Is PULSE real money?',
    a: 'No. PULSE is a purely in-server currency with zero monetary value. It cannot be cashed out, exchanged, or refunded. Everything is entertainment — no gambling regulation applies.',
  },
  {
    q: 'How is my data handled?',
    a: 'We only store what the bot needs to work: Discord IDs, PULSE balances, activity counts, and companion messages you send. Data lives in EU-hosted Supabase, encrypted at rest. Details in our Privacy Policy.',
  },
  {
    q: 'Does the AI companion learn from private messages?',
    a: 'No. Each companion has a 30-message rolling memory scoped to one user. Conversations are never used for training, never shared, and can be wiped at any time with `/compagnon delete`.',
  },
  {
    q: 'Do I need coding to configure Novarys?',
    a: 'Zero code. Everything — welcome messages, shop items, automod rules, seasons, sagas — is edited from the web dashboard with normal forms and toggles.',
  },
  {
    q: 'Can I try Pro before paying?',
    a: 'Yes — get in touch and we\'ll enable a 14-day trial on Pro for your server.',
  },
];
