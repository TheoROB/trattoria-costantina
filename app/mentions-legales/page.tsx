import type { Metadata } from 'next'
import { Footer } from '@/components/sections/Footer'
import { Navbar } from '@/components/sections/Navbar'
import { socialMetadata } from '@/lib/seo/metadata'
import { site } from '@/lib/site'

const title = 'Mentions légales — Trattoria Costantina'

export const metadata: Metadata = {
  title,
  // Kept out of search results until the missing legal details (lib/site.ts) are provided.
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
          <li><strong>Nom commercial :</strong> {site.name}</li>
          <li><strong>Forme juridique :</strong> {site.legalForm}</li>
          <li><strong>Gérant :</strong> {site.manager}</li>
          <li>
            <strong>Adresse :</strong> {site.address.street}, {site.address.postalCode} {site.address.city},{' '}
            {site.address.country}
          </li>
          <li><strong>SIRET :</strong> {site.siret}</li>
          <li><strong>Téléphone :</strong> <a href={site.phone.href}>{site.phone.display}</a></li>
          <li><strong>Email :</strong> <a href={site.email.href}>{site.email.display}</a></li>
        </ul>

        <h2>Hébergement</h2>
        <ul>
          <li>{site.host.name} — {site.host.company}</li>
          <li>{site.host.address}</li>
        </ul>

        <h2>Cookies</h2>
        {/* Matches the code: no analytics or ads; the only first-party cookie is the admin session (lib/auth/dal.ts). */}
        <p>
          Ce site ne dépose aucun cookie de mesure d&apos;audience ni de publicité. Seul l&apos;espace
          d&apos;administration, réservé à l&apos;équipe du restaurant, utilise un cookie de session strictement
          nécessaire à la connexion.
        </p>
        <p>
          Le module de réservation en ligne est fourni par DISH (reservation.dish.co) et intégré à la page
          d&apos;accueil : son utilisation relève de la politique de confidentialité et de cookies de ce prestataire.
        </p>
      </main>
      <Footer />
    </>
  )
}
