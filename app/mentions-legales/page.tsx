import type { Metadata } from 'next'
import { Footer } from '@/components/sections/Footer'
import { Navbar } from '@/components/sections/Navbar'
import { socialMetadata } from '@/lib/seo/metadata'
import { site } from '@/lib/site'

const title = 'Mentions légales — Trattoria Costantina'

export const metadata: Metadata = {
  title,
  // Kept out of search results: the publication director is still missing (lib/site.ts).
  robots: { index: false },
  // Overrides the home page canonical and social card inherited from the root layout.
  alternates: { canonical: '/mentions-legales' },
  ...socialMetadata({ title, description: `Mentions légales du site ${site.name}.`, path: '/mentions-legales' }),
}

export default function MentionsLegalesPage() {
  return (
    <>
      <Navbar solid />
      <main className="legal-page container">
        <h1>Mentions légales</h1>
        <div className="title-divider"></div>

        <h2>Éditeur du site</h2>
        <ul>
          <li><strong>Raison sociale :</strong> {site.company.name}</li>
          <li><strong>Nom commercial :</strong> {site.name}</li>
          <li>
            <strong>Forme juridique :</strong> {site.company.legalForm} au capital de {site.company.capital}
          </li>
          <li>
            <strong>Siège social :</strong> {site.address.street}, {site.address.postalCode} {site.address.city},{' '}
            {site.address.country}
          </li>
          <li><strong>RCS :</strong> {site.company.rcs}</li>
          <li><strong>SIREN :</strong> {site.company.siren}</li>
          <li><strong>SIRET :</strong> {site.company.siret}</li>
          <li><strong>TVA intracommunautaire :</strong> {site.company.vatNumber}</li>
          <li><strong>Gérant :</strong> {site.manager}</li>
          {/* TODO: add "Directeur de la publication" once the client confirms who it is (missingLegalInfo in lib/site.ts). */}
          <li><strong>Téléphone :</strong> <a href={site.phone.href}>{site.phone.display}</a></li>
          <li><strong>Email :</strong> <a href={site.email.href}>{site.email.display}</a></li>
        </ul>

        <h2>Hébergement</h2>
        <ul>
          <li>{site.host.name} — {site.host.company}</li>
          <li>{site.host.address}</li>
        </ul>

        <h2 id="donnees-personnelles">Données personnelles</h2>
        {/* Matches lib/contact: messages are only e-mailed to the restaurant, never written to the database. */}
        <p>
          Le responsable du traitement est la société {site.company.name} ({site.company.legalForm}), éditrice du
          site. Les informations saisies dans le formulaire de contact servent uniquement à répondre à votre
          demande : elles sont transmises par e-mail au restaurant, via le service d&apos;envoi d&apos;e-mails Resend
          (Resend, Inc., États-Unis), et reçues dans la boîte Gmail (Google) du restaurant. Elles ne sont pas
          enregistrées dans la base de données du site.
        </p>
        {/* Matches lib/contact/recaptcha.ts (reCAPTCHA Enterprise, only when its keys are configured). Since April 2, 2026
            Google processes reCAPTCHA data as a processor only (Google reCAPTCHA FAQ). Transfers: Cloud Data Processing
            Addendum, Google LLC certified to the EU-U.S. Data Privacy Framework (cloud.google.com/terms). */}
        <p>
          Pour la sécurité du formulaire de contact, c&apos;est-à-dire la prévention du spam et des envois abusifs,
          le site utilise le service reCAPTCHA de Google Cloud. Le responsable de ce traitement est la société{' '}
          {site.company.name}, éditrice du site ; Google agit en qualité de sous-traitant, uniquement pour fournir ce
          service. Lors de l&apos;envoi du formulaire, reCAPTCHA analyse votre adresse IP, des informations
          techniques sur votre navigateur et votre appareil, et vos interactions avec la page ; le contenu de votre
          message n&apos;est pas transmis à Google. Ces données servent uniquement à évaluer, au moment de
          l&apos;envoi, si celui-ci provient d&apos;une personne ou d&apos;un robot. Ce traitement repose sur
          l&apos;intérêt légitime de l&apos;éditeur à protéger son site et sa messagerie contre les abus (article
          6.1.f du RGPD). Ces données peuvent être traitées hors de l&apos;Union européenne, notamment aux
          États-Unis : ces transferts sont encadrés par les garanties prévues par l&apos;avenant relatif au
          traitement des données de Google Cloud, Google LLC étant certifiée au cadre de protection des données
          UE–États-Unis (Data Privacy Framework), et à défaut par des clauses contractuelles types.
        </p>
        <p>
          Conformément au Règlement général sur la protection des données (RGPD) et à la loi Informatique et
          Libertés, vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement,
          d&apos;opposition et de limitation du traitement de vos données. Pour les exercer, écrivez à{' '}
          <a href={site.email.href}>{site.email.display}</a>. Vous pouvez également adresser une réclamation à la
          CNIL (<a href="https://www.cnil.fr">www.cnil.fr</a>).
        </p>

        <h2>Cookies</h2>
        {/* Matches the code: no analytics or ads; the only first-party cookie is the admin session (lib/auth/dal.ts).
            _GRECAPTCHA: "necessary cookie" set by reCAPTCHA for its risk analysis (Google reCAPTCHA FAQ), on the pages
            that load enterprise.js, i.e. those with the contact form; CNIL exemption for security cookies. No lifetime
            is published by Google, so none is stated. */}
        <p>
          Ce site ne dépose aucun cookie de mesure d&apos;audience ni de publicité. L&apos;espace
          d&apos;administration, réservé à l&apos;équipe du restaurant, utilise un cookie de session strictement
          nécessaire à la connexion.
        </p>
        <p>
          Sur les pages proposant le formulaire de contact, le service reCAPTCHA dépose le cookie{' '}
          <code>_GRECAPTCHA</code>, utilisé pour l&apos;analyse de risque qui protège ce formulaire contre le spam et
          les abus. Strictement nécessaire à la sécurité du formulaire et n&apos;étant utilisé à aucune autre fin,
          il ne requiert pas votre consentement.
        </p>
        <p>
          Le module de réservation en ligne est fourni par DISH (reservation.dish.co) et proposé sur les
          pages du site : son utilisation relève de la politique de confidentialité et de cookies de ce prestataire.
          Lorsqu&apos;une demande de réservation y est envoyée, le site enregistre uniquement sa date, son heure et
          son nombre de couverts, pour le suivi du restaurant : ni nom, ni coordonnées, ni message.
        </p>
      </main>
      <Footer />
    </>
  )
}
