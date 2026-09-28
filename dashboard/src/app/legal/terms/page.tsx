import Link from 'next/link';
import { getPublicLocale } from '@/lib/publicLocale';
import { LanguageSwitch } from '../../LanguageSwitch';

export const metadata = {
  title: 'Terms of Service — Novarys',
  description: 'Terms of Service for the Novarys Discord bot and dashboard.',
};

const COPY = {
  en: {
    back: '← Back',
    title: 'Terms of Service',
    lastUpdated: 'Last updated: 28 September 2026',
    sections: [
      { h: '1. Purpose', p: 'Novarys is an online service consisting of (i) a Discord bot and (ii) a web dashboard (the "Service"), published by The Flippin\' Labs ("we"). These terms govern the use of the Service by Discord server administrators ("Lords") and end members.' },
      { h: '2. Account and eligibility', p: 'Access to the Service requires a valid Discord account. You must be at least 13 years old (or the minimum digital-consent age in your country). You are responsible for the confidentiality of your credentials and any activity carried out from your account.' },
      { h: '3. Subscriptions and billing', items: [
        'The free plan ("Free") is provided with no commitment.',
        'Paid plans (Starter €29/month, Pro €79/month, Enterprise on quote) are billed monthly by Stripe.',
        'Prices are shown exclusive of tax; applicable VAT is added at checkout when relevant.',
        'The subscription renews automatically at the end of the period and can be cancelled at any time via the Stripe customer portal accessible from <code>/dashboard/billing</code>. Access to paid features remains active until the end of the paid period.',
        'In accordance with article L. 221-28 of the French Consumer Code, by starting to use a paid feature upon subscribing, you waive your 14-day right of withdrawal for the portion already performed.',
      ] },
      { h: '4. Virtual economy (PULSE)', p: 'The in-service currency "PULSE" has no monetary value, cannot be exchanged for real money, and cannot be refunded. The game features of the Service use PULSE only and do not constitute gambling within the meaning of applicable law.' },
      { h: '5. Acceptable use', pre: 'You may not:', items: [
        'use the Service to host, distribute or promote illegal, hateful, harassing or child-sexual content;',
        'circumvent technical limits or subscription gates, including via scripts, bots or external automation;',
        'attempt unauthorized access to the Service or its data;',
        'use the Service to send spam or phishing.',
      ], post: 'Any violation may result in the immediate suspension of the account without notice, and termination of the subscription without refund.' },
      { h: '6. User content', p: 'You keep all your rights on the content you submit to the Service (pet names, companion memory notes, riddle answers). You grant us the non-exclusive, royalty-free licence needed to technically operate the Service, for the sole duration of Service delivery.' },
      { h: '7. Availability and evolution', p: 'We do our best to keep the Service accessible continuously, without warranting 100 % availability. Features may evolve; we will announce any major removal of a paid feature at least 30 days in advance.' },
      { h: '8. Limitation of liability', p: 'To the extent permitted by law, our liability under the Service is capped at the amounts actually paid by the Lord for the paid plan in the 12 months preceding the event giving rise to the damage. We are in no case liable for indirect or intangible losses (loss of non-essential data, loss of virtual PULSE, loss of Discord audience).' },
      { h: '9. Termination', p: 'You may stop using the Service at any time. The Lord may cancel the paid subscription from the Stripe portal. We may terminate immediately in case of serious breach of these terms.' },
      { h: '10. Governing law', p: 'These terms are governed by French law. Any dispute not settled amicably falls under the exclusive jurisdiction of the courts of the publisher\'s registered office, subject to the mandatory rules protecting consumers.' },
      { h: '11. Contact', p: 'The Flippin\' Labs — <a class="text-pulse-gold underline" href="mailto:theflippinlabs@gmail.com">theflippinlabs@gmail.com</a>.' },
    ],
  },
  fr: {
    back: '← Retour',
    title: 'Conditions générales d\'utilisation',
    lastUpdated: 'Dernière mise à jour : 28 septembre 2026',
    sections: [
      { h: '1. Objet', p: 'Novarys est un service en ligne composé (i) d\'un bot Discord et (ii) d\'un tableau de bord web (ci-après « le Service ») édité par The Flippin\' Labs (« nous »). Les présentes conditions régissent l\'usage du Service par les administrateurs de serveurs Discord (« Lords ») et par les membres finaux.' },
      { h: '2. Compte et éligibilité', p: 'L\'accès au Service requiert un compte Discord valide. Vous devez avoir au moins 13 ans (ou l\'âge minimum de consentement numérique de votre pays). Vous êtes responsable de la confidentialité de vos identifiants et de toute activité effectuée depuis votre compte.' },
      { h: '3. Abonnements et facturation', items: [
        'Le plan gratuit (« Free ») est fourni sans engagement.',
        'Les plans payants (Starter 29 €/mois, Pro 79 €/mois, Enterprise sur devis) sont facturés mensuellement par Stripe.',
        'Les prix sont indiqués hors taxes ; la TVA applicable est ajoutée à la facturation le cas échéant.',
        'L\'abonnement se renouvelle automatiquement à l\'échéance et peut être annulé à tout moment via le portail client Stripe accessible depuis <code>/dashboard/billing</code>. L\'accès aux fonctionnalités payantes reste actif jusqu\'à la fin de la période payée.',
        'Conformément à l\'article L. 221-28 du Code de la consommation, en démarrant l\'utilisation d\'une fonctionnalité payante dès la souscription, vous renoncez à votre droit de rétractation de 14 jours pour la partie déjà exécutée.',
      ] },
      { h: '4. Économie virtuelle (PULSE)', p: 'La monnaie interne « PULSE » n\'a aucune valeur monétaire, n\'est pas échangeable contre de l\'argent réel, et ne peut être remboursée. Les fonctionnalités de jeu du Service utilisent uniquement PULSE et ne constituent pas un jeu d\'argent au sens de la loi.' },
      { h: '5. Usage acceptable', pre: 'Il vous est interdit :', items: [
        'd\'utiliser le Service pour héberger, diffuser ou promouvoir des contenus illégaux, haineux, harcelants, ou à caractère sexuel impliquant des mineurs ;',
        'de contourner les limites techniques ou les gates d\'abonnement, y compris par script, bot ou automatisation externe ;',
        'de tenter d\'obtenir un accès non autorisé au Service ou à ses données ;',
        'd\'utiliser le Service pour envoyer du spam ou du phishing.',
      ], post: 'Toute violation peut entraîner la suspension immédiate et sans préavis du compte, ainsi que la résiliation de l\'abonnement sans remboursement.' },
      { h: '6. Contenus utilisateurs', p: 'Vous conservez tous vos droits sur les contenus que vous soumettez au Service (nom de pet, notes de mémoire compagnon, réponses aux énigmes). Vous nous concédez la licence non exclusive et gratuite nécessaire à l\'exploitation technique du Service pour la seule durée de fourniture du Service.' },
      { h: '7. Disponibilité et évolution', p: 'Nous nous efforçons de maintenir le Service accessible en continu, sans garantie de disponibilité à 100 %. Les fonctionnalités peuvent évoluer ; nous préviendrons de toute suppression majeure d\'une fonctionnalité incluse dans un plan payant au moins 30 jours à l\'avance.' },
      { h: '8. Limitation de responsabilité', p: 'Dans les limites autorisées par la loi, notre responsabilité au titre du Service est plafonnée aux sommes effectivement versées par le Lord au titre du plan payant dans les 12 mois précédant l\'événement à l\'origine du dommage. Nous ne sommes en aucun cas responsables des pertes indirectes ou immatérielles (perte de données non essentielles, perte de PULSE virtuel, perte d\'audience Discord).' },
      { h: '9. Résiliation', p: 'Vous pouvez cesser d\'utiliser le Service à tout moment. Le Lord peut annuler l\'abonnement payant depuis le portail Stripe. Nous pouvons résilier immédiatement en cas de violation grave des présentes conditions.' },
      { h: '10. Droit applicable', p: 'Les présentes conditions sont soumises au droit français. Tout litige non résolu à l\'amiable relève de la compétence exclusive des tribunaux du ressort du siège social de l\'éditeur, sous réserve des règles impératives protégeant les consommateurs.' },
      { h: '11. Contact', p: 'The Flippin\' Labs — <a class="text-pulse-gold underline" href="mailto:theflippinlabs@gmail.com">theflippinlabs@gmail.com</a>.' },
    ],
  },
} as const;

export default function TermsPage() {
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
        {c.sections.map((s) => (
          <div key={s.h}>
            <h2 className="text-xl font-semibold mb-2 text-pulse-gold">{s.h}</h2>
            {'p' in s && s.p && (
              <p dangerouslySetInnerHTML={{ __html: s.p }} />
            )}
            {'pre' in s && s.pre && <p className="mb-2">{s.pre}</p>}
            {'items' in s && s.items && (
              <ul className="list-disc ml-6 space-y-1">
                {s.items.map((it) => (
                  <li key={it} dangerouslySetInnerHTML={{ __html: it }} />
                ))}
              </ul>
            )}
            {'post' in s && s.post && <p className="mt-2">{s.post}</p>}
          </div>
        ))}
      </section>
    </main>
  );
}
