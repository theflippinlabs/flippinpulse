import Link from 'next/link';
import { getPublicLocale } from '@/lib/publicLocale';
import { LanguageSwitch } from '../../LanguageSwitch';

export const metadata = {
  title: 'Privacy Policy — Novarys',
  description: 'How Novarys collects, processes and protects personal data.',
};

const COPY = {
  en: {
    back: '← Back',
    title: 'Privacy Policy',
    lastUpdated: 'Last updated: 28 September 2026',
    intro: 'This policy explains how Novarys ("we") collects, uses and protects the personal data of users of the Novarys Discord bot and the associated web dashboard (the "Service"). Novarys is published by The Flippin\' Labs (contact: theflippinlabs@gmail.com). The data controller under GDPR is The Flippin\' Labs.',
    sections: [
      { h: '1. Data we collect', items: [
        'Discord ID, username, avatar (via Discord OAuth).',
        'Content you voluntarily submit to the Service: messages sent to the AI companion, riddle answers, pet and card customizations, PULSE transactions.',
        'Activity metadata from the Discord server(s) where the bot is installed: XP, game participation, event dates.',
        'Technical data: truncated IP address, session tokens, language preferences and technical cookies.',
        'Payment data: payments are processed by Stripe. We never receive or store card numbers — only Stripe customer identifiers and a subscription status.',
      ] },
      { h: '2. Purposes', items: [
        'Provide Service features (PULSE economy, games, AI companion, analytics).',
        'Secure the Service and prevent fraud and abuse.',
        'Manage subscriptions and billing through Stripe.',
        'Respond to support requests.',
      ] },
      { h: '3. Legal bases', p: 'Performance of the contract for core Service functions; legitimate interest for security and anti-fraud; consent for non-essential cookies and push notifications; legal obligations for billing.' },
      { h: '4. Sub-processors', items: [
        '<b>Discord</b> — identity and messaging infrastructure of the bot.',
        '<b>Supabase</b> (EU) — database and storage.',
        '<b>Railway</b> — bot hosting.',
        '<b>Vercel</b> — dashboard hosting.',
        '<b>Stripe</b> — payment processing.',
        '<b>Anthropic</b> — language model for AI companion replies. Messages are sent to Anthropic solely to generate a response and are NOT used for training.',
      ] },
      { h: '5. Retention', items: [
        'User account: as long as you are a member of a server where the bot is active.',
        'AI companion conversation history: last 30 messages, automatically purged beyond that.',
        'Security logs: 90 days.',
        'Invoices and accounting data: 10 years (legal obligation).',
      ] },
      { h: '6. Your rights (GDPR)', p: 'You have the right to access, rectify, erase, object to, restrict and port your data. To exercise these rights, write to <a class="text-pulse-gold underline" href="mailto:theflippinlabs@gmail.com">theflippinlabs@gmail.com</a>. You may also file a complaint with your local data protection authority (in France, the CNIL).' },
      { h: '7. Account deletion', p: 'You can delete your AI companion at any time via <code>/compagnon delete</code>. To delete all your Novarys data, email the address above; deletion is completed within 30 days.' },
      { h: '8. Cookies', p: 'We only use strictly necessary technical cookies (session, language preferences). No advertising or third-party tracking cookies are set.' },
      { h: '9. Minors', p: 'The Service is not intended for children under 13 (or under 15 in France without parental consent). If you are a parent or guardian and believe a minor has provided us with data, contact us and we will delete it.' },
      { h: '10. Changes', p: 'Any substantial update to this policy will be announced on the dashboard and via a message in the Discord server at least 30 days before it takes effect.' },
    ],
  },
  fr: {
    back: '← Retour',
    title: 'Politique de confidentialité',
    lastUpdated: 'Dernière mise à jour : 28 septembre 2026',
    intro: 'La présente politique explique comment Novarys (« nous ») collecte, utilise et protège les données à caractère personnel des utilisateurs du bot Discord Novarys et du tableau de bord web associé (« le Service »). Novarys est édité par The Flippin\' Labs (contact : theflippinlabs@gmail.com). Le responsable du traitement au sens du RGPD est The Flippin\' Labs.',
    sections: [
      { h: '1. Données collectées', items: [
        'Identifiant Discord, nom d\'utilisateur, avatar (via OAuth Discord).',
        'Contenu que vous soumettez volontairement au Service : messages envoyés au compagnon IA, réponses aux énigmes, personnalisation de pets et de cartes, transactions PULSE.',
        'Métadonnées d\'activité côté serveur Discord où le bot est installé : XP, participation aux jeux, dates d\'événements.',
        'Données techniques : adresse IP tronquée, jetons de session, préférences de langue et cookies techniques.',
        'Données de paiement : le paiement est traité par Stripe. Nous ne recevons ni ne stockons de numéros de carte — uniquement des identifiants client Stripe et un statut d\'abonnement.',
      ] },
      { h: '2. Finalités', items: [
        'Fournir les fonctionnalités du Service (économie PULSE, jeux, IA compagnon, analytics).',
        'Sécuriser le Service et prévenir les fraudes et abus.',
        'Gérer les abonnements et facturer via Stripe.',
        'Répondre aux demandes de support.',
      ] },
      { h: '3. Bases légales', p: 'Exécution du contrat pour les fonctions cœur du Service ; intérêt légitime pour la sécurité et la lutte contre la fraude ; consentement pour les cookies non essentiels et les notifications push ; obligations légales pour la facturation.' },
      { h: '4. Sous-traitants', items: [
        '<b>Discord</b> — infrastructure d\'identité et de messagerie du bot.',
        '<b>Supabase</b> (UE) — base de données et stockage.',
        '<b>Railway</b> — hébergement du bot.',
        '<b>Vercel</b> — hébergement du tableau de bord.',
        '<b>Stripe</b> — traitement des paiements.',
        '<b>Anthropic</b> — modèle de langage pour les réponses du compagnon IA. Les messages sont transmis à Anthropic uniquement pour générer une réponse et ne sont pas utilisés pour l\'entraînement.',
      ] },
      { h: '5. Durées de conservation', items: [
        'Compte utilisateur : tant que vous êtes membre d\'un serveur où le bot est actif.',
        'Historique de conversation compagnon IA : 30 derniers messages, purge automatique au-delà.',
        'Journaux de sécurité : 90 jours.',
        'Factures et données comptables : 10 ans (obligation légale).',
      ] },
      { h: '6. Vos droits (RGPD)', p: 'Vous disposez d\'un droit d\'accès, de rectification, d\'effacement, d\'opposition, de limitation et de portabilité concernant vos données. Pour exercer ces droits, écrivez à <a class="text-pulse-gold underline" href="mailto:theflippinlabs@gmail.com">theflippinlabs@gmail.com</a>. Vous pouvez aussi introduire une réclamation auprès de la CNIL.' },
      { h: '7. Suppression de compte', p: 'Vous pouvez supprimer votre compagnon IA à tout moment via <code>/compagnon delete</code>. Pour supprimer l\'intégralité de vos données Novarys, envoyez un courriel à l\'adresse ci-dessus ; la suppression est effective sous 30 jours.' },
      { h: '8. Cookies', p: 'Nous utilisons uniquement des cookies techniques strictement nécessaires (session, préférences de langue). Aucun cookie publicitaire ou de suivi tiers n\'est déposé.' },
      { h: '9. Mineurs', p: 'Le Service n\'est pas destiné aux moins de 13 ans (ni aux moins de 15 ans en France sans consentement parental). Si vous êtes un parent ou tuteur et pensez qu\'un mineur nous a fourni des données, contactez-nous et nous supprimerons ces données.' },
      { h: '10. Modifications', p: 'Toute mise à jour substantielle de cette politique sera annoncée sur le tableau de bord et par message dans le serveur Discord au moins 30 jours avant son entrée en vigueur.' },
    ],
  },
} as const;

export default function PrivacyPage() {
  const locale = getPublicLocale();
  const c = COPY[locale];

  return (
    <main className="min-h-screen px-6 py-16 max-w-3xl mx-auto text-pulse-text">
      <div className="flex items-center justify-between mb-6">
        <Link href="/" className="text-sm text-pulse-mute hover:text-pulse-gold">{c.back}</Link>
        <LanguageSwitch current={locale} />
      </div>
      <h1 className="text-3xl font-bold mb-2">{c.title}</h1>
      <p className="text-sm text-pulse-mute mb-10">{c.lastUpdated}</p>

      <section className="space-y-6 leading-relaxed text-[15px]">
        <p>{c.intro}</p>

        {c.sections.map((s) => (
          <div key={s.h}>
            <h2 className="text-xl font-semibold mb-2 text-pulse-gold">{s.h}</h2>
            {'p' in s && s.p && (
              <p dangerouslySetInnerHTML={{ __html: s.p }} />
            )}
            {'items' in s && s.items && (
              <ul className="list-disc ml-6 space-y-1">
                {s.items.map((it) => (
                  <li key={it} dangerouslySetInnerHTML={{ __html: it }} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
