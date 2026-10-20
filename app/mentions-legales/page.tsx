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
        <p>
          Conformément au Règlement général sur la protection des données (RGPD) et à la loi Informatique et
          Libertés, vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement,
          d&apos;opposition et de limitation du traitement de vos données. Pour les exercer, écrivez à{' '}
          <a href={site.email.href}>{site.email.display}</a>. Vous pouvez également adresser une réclamation à la
          CNIL (<a href="https://www.cnil.fr">www.cnil.fr</a>).
        </p>

        <h2>Cookies</h2>
        {/* Matches the code: no analytics or ads; the only first-party cookie is the admin session (lib/auth/dal.ts). */}
        <p>
          Ce site ne dépose aucun cookie de mesure d&apos;audience ni de publicité. Seul l&apos;espace
          d&apos;administration, réservé à l&apos;équipe du restaurant, utilise un cookie de session strictement
          nécessaire à la connexion.
        </p>
        <p>
          Le module de réservation en ligne est fourni par DISH (reservation.dish.co) et proposé sur les
          pages du site : son utilisation relève de la politique de confidentialité et de cookies de ce prestataire.
        </p>
      </main>
      <Footer />
    </>
  )
}
