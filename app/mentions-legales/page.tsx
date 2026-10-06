import type { Metadata } from 'next'
import { Footer } from '@/components/sections/Footer'
import { Navbar } from '@/components/sections/Navbar'
import { site } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Mentions légales — Trattoria Costantina',
  // Kept out of search results until the missing legal details (lib/site.ts) are provided.
  robots: { index: false },
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
      </main>
      <Footer />
    </>
  )
}
