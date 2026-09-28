import Link from 'next/link';

export const metadata = {
  title: 'Politique de confidentialité — Novarys',
  description: 'Comment Novarys collecte, traite et protège les données personnelles.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen px-6 py-16 max-w-3xl mx-auto text-pulse-text">
      <Link href="/" className="text-sm text-pulse-mute hover:text-pulse-gold">← Retour</Link>
      <h1 className="text-3xl font-bold mt-6 mb-2">Politique de confidentialité</h1>
      <p className="text-sm text-pulse-mute mb-10">Dernière mise à jour : 28 septembre 2026</p>

      <section className="space-y-6 leading-relaxed text-[15px]">
        <p>
          La présente politique explique comment Novarys (« nous ») collecte, utilise et
          protège les données à caractère personnel des utilisateurs du bot Discord Novarys
          et du tableau de bord web associé (« le Service »). Novarys est édité par The
          Flippin&apos; Labs (contact : theflippinlabs@gmail.com). Le responsable du
          traitement au sens du RGPD est The Flippin&apos; Labs.
        </p>

        <div>
          <h2 className="text-xl font-semibold mb-2 text-pulse-gold">1. Données collectées</h2>
          <ul className="list-disc ml-6 space-y-1">
            <li>Identifiant Discord, nom d&apos;utilisateur, avatar (via OAuth Discord).</li>
            <li>Contenu que vous soumettez volontairement au Service : messages envoyés au compagnon IA, réponses aux énigmes, personnalisation de pets et de cartes, transactions PULSE.</li>
            <li>Métadonnées d&apos;activité côté serveur Discord où le bot est installé : XP, participation aux jeux, dates d&apos;événements.</li>
            <li>Données techniques : adresse IP tronquée, jetons de session, préférences de langue et cookies techniques.</li>
            <li>Données de paiement : le paiement est traité par Stripe. Nous ne recevons ni ne stockons de numéros de carte — uniquement des identifiants client Stripe et un statut d&apos;abonnement.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2 text-pulse-gold">2. Finalités</h2>
          <ul className="list-disc ml-6 space-y-1">
            <li>Fournir les fonctionnalités du Service (économie PULSE, jeux, IA compagnon, analytics).</li>
            <li>Sécuriser le Service et prévenir les fraudes et abus.</li>
            <li>Gérer les abonnements et facturer via Stripe.</li>
            <li>Répondre aux demandes de support.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2 text-pulse-gold">3. Bases légales</h2>
          <p>
            Exécution du contrat pour les fonctions cœur du Service ; intérêt légitime pour
            la sécurité et la lutte contre la fraude ; consentement pour les cookies non
            essentiels et les notifications push ; obligations légales pour la facturation.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2 text-pulse-gold">4. Sous-traitants</h2>
          <ul className="list-disc ml-6 space-y-1">
            <li><b>Discord</b> — infrastructure d&apos;identité et de messagerie du bot.</li>
            <li><b>Supabase</b> (UE) — base de données et stockage.</li>
            <li><b>Railway</b> — hébergement du bot.</li>
            <li><b>Vercel</b> — hébergement du tableau de bord.</li>
            <li><b>Stripe</b> — traitement des paiements.</li>
            <li><b>Anthropic</b> — modèle de langage pour les réponses du compagnon IA. Les messages sont transmis à Anthropic uniquement pour générer une réponse et ne sont pas utilisés pour l&apos;entraînement.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2 text-pulse-gold">5. Durées de conservation</h2>
          <ul className="list-disc ml-6 space-y-1">
            <li>Compte utilisateur : tant que vous êtes membre d&apos;un serveur où le bot est actif.</li>
            <li>Historique de conversation compagnon IA : 30 derniers messages, purge automatique au-delà.</li>
            <li>Journaux de sécurité : 90 jours.</li>
            <li>Factures et données comptables : 10 ans (obligation légale).</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2 text-pulse-gold">6. Vos droits (RGPD)</h2>
          <p>
            Vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement,
            d&apos;opposition, de limitation et de portabilité concernant vos données.
            Pour exercer ces droits, écrivez à <a className="text-pulse-gold underline"
            href="mailto:theflippinlabs@gmail.com">theflippinlabs@gmail.com</a>. Vous pouvez
            aussi introduire une réclamation auprès de la CNIL.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2 text-pulse-gold">7. Suppression de compte</h2>
          <p>
            Vous pouvez supprimer votre compagnon IA à tout moment via <code>/compagnon delete</code>.
            Pour supprimer l&apos;intégralité de vos données Novarys, envoyez un courriel
            à l&apos;adresse ci-dessus ; la suppression est effective sous 30 jours.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2 text-pulse-gold">8. Cookies</h2>
          <p>
            Nous utilisons uniquement des cookies techniques strictement nécessaires
            (session, préférences de langue). Aucun cookie publicitaire ou de suivi
            tiers n&apos;est déposé.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2 text-pulse-gold">9. Mineurs</h2>
          <p>
            Le Service n&apos;est pas destiné aux moins de 13 ans (ni aux moins de 15 ans
            en France sans consentement parental). Si vous êtes un parent ou tuteur et
            pensez qu&apos;un mineur nous a fourni des données, contactez-nous et nous
            supprimerons ces données.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2 text-pulse-gold">10. Modifications</h2>
          <p>
            Toute mise à jour substantielle de cette politique sera annoncée sur le
            tableau de bord et par message dans le serveur Discord au moins 30 jours
            avant son entrée en vigueur.
          </p>
        </div>
      </section>
    </main>
  );
}
