import Link from 'next/link';

export const metadata = {
  title: 'Conditions générales — Novarys',
  description: 'Conditions générales d\'utilisation du bot Novarys et du dashboard.',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen px-6 py-16 max-w-3xl mx-auto text-pulse-text">
      <Link href="/" className="text-sm text-pulse-mute hover:text-pulse-gold">← Retour</Link>
      <h1 className="text-3xl font-bold mt-6 mb-2">Conditions générales d&apos;utilisation</h1>
      <p className="text-sm text-pulse-mute mb-10">Dernière mise à jour : 28 septembre 2026</p>

      <section className="space-y-6 leading-relaxed text-[15px]">
        <div>
          <h2 className="text-xl font-semibold mb-2 text-pulse-gold">1. Objet</h2>
          <p>
            Novarys est un service en ligne composé (i) d&apos;un bot Discord et (ii) d&apos;un
            tableau de bord web (ci-après « le Service ») édité par The Flippin&apos; Labs
            (« nous »). Les présentes conditions régissent l&apos;usage du Service par les
            administrateurs de serveurs Discord (« Lords ») et par les membres finaux.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2 text-pulse-gold">2. Compte et éligibilité</h2>
          <p>
            L&apos;accès au Service requiert un compte Discord valide. Vous devez avoir au
            moins 13 ans (ou l&apos;âge minimum de consentement numérique de votre pays).
            Vous êtes responsable de la confidentialité de vos identifiants et de toute
            activité effectuée depuis votre compte.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2 text-pulse-gold">3. Abonnements et facturation</h2>
          <ul className="list-disc ml-6 space-y-1">
            <li>Le plan gratuit (« Free ») est fourni sans engagement.</li>
            <li>Les plans payants (Starter 29 €/mois, Pro 79 €/mois, Enterprise sur devis) sont facturés mensuellement par Stripe.</li>
            <li>Les prix sont indiqués hors taxes ; la TVA applicable est ajoutée à la facturation le cas échéant.</li>
            <li>L&apos;abonnement se renouvelle automatiquement à l&apos;échéance et peut être annulé à tout moment via le portail client Stripe accessible depuis <code>/dashboard/billing</code>. L&apos;accès aux fonctionnalités payantes reste actif jusqu&apos;à la fin de la période payée.</li>
            <li>Conformément à l&apos;article L. 221-28 du Code de la consommation, en démarrant l&apos;utilisation d&apos;une fonctionnalité payante dès la souscription, vous renoncez à votre droit de rétractation de 14 jours pour la partie déjà exécutée.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2 text-pulse-gold">4. Économie virtuelle (PULSE)</h2>
          <p>
            La monnaie interne « PULSE » n&apos;a aucune valeur monétaire, n&apos;est pas
            échangeable contre de l&apos;argent réel, et ne peut être remboursée. Les
            fonctionnalités de jeu du Service utilisent uniquement PULSE et ne
            constituent pas un jeu d&apos;argent au sens de la loi.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2 text-pulse-gold">5. Usage acceptable</h2>
          <p>Il vous est interdit :</p>
          <ul className="list-disc ml-6 space-y-1">
            <li>d&apos;utiliser le Service pour héberger, diffuser ou promouvoir des contenus illégaux, haineux, harcelants, ou à caractère sexuel impliquant des mineurs ;</li>
            <li>de contourner les limites techniques ou les gates d&apos;abonnement, y compris par script, bot ou automatisation externe ;</li>
            <li>de tenter d&apos;obtenir un accès non autorisé au Service ou à ses données ;</li>
            <li>d&apos;utiliser le Service pour envoyer du spam ou du phishing.</li>
          </ul>
          <p className="mt-2">
            Toute violation peut entraîner la suspension immédiate et sans préavis du
            compte, ainsi que la résiliation de l&apos;abonnement sans remboursement.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2 text-pulse-gold">6. Contenus utilisateurs</h2>
          <p>
            Vous conservez tous vos droits sur les contenus que vous soumettez au Service
            (nom de pet, notes de mémoire compagnon, réponses aux énigmes). Vous nous
            concédez la licence non exclusive et gratuite nécessaire à l&apos;exploitation
            technique du Service pour la seule durée de fourniture du Service.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2 text-pulse-gold">7. Disponibilité et évolution</h2>
          <p>
            Nous nous efforçons de maintenir le Service accessible en continu, sans garantie
            de disponibilité à 100 %. Les fonctionnalités peuvent évoluer ; nous préviendrons
            de toute suppression majeure d&apos;une fonctionnalité incluse dans un plan payant
            au moins 30 jours à l&apos;avance.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2 text-pulse-gold">8. Limitation de responsabilité</h2>
          <p>
            Dans les limites autorisées par la loi, notre responsabilité au titre du Service
            est plafonnée aux sommes effectivement versées par le Lord au titre du plan
            payant dans les 12 mois précédant l&apos;événement à l&apos;origine du dommage.
            Nous ne sommes en aucun cas responsables des pertes indirectes ou immatérielles
            (perte de données non essentielles, perte de PULSE virtuel, perte d&apos;audience Discord).
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2 text-pulse-gold">9. Résiliation</h2>
          <p>
            Vous pouvez cesser d&apos;utiliser le Service à tout moment. Le Lord peut annuler
            l&apos;abonnement payant depuis le portail Stripe. Nous pouvons résilier
            immédiatement en cas de violation grave des présentes conditions.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2 text-pulse-gold">10. Droit applicable</h2>
          <p>
            Les présentes conditions sont soumises au droit français. Tout litige non résolu
            à l&apos;amiable relève de la compétence exclusive des tribunaux du ressort du
            siège social de l&apos;éditeur, sous réserve des règles impératives protégeant
            les consommateurs.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2 text-pulse-gold">11. Contact</h2>
          <p>
            The Flippin&apos; Labs — <a className="text-pulse-gold underline"
            href="mailto:theflippinlabs@gmail.com">theflippinlabs@gmail.com</a>.
          </p>
        </div>
      </section>
    </main>
  );
}
