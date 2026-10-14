import type { Metadata, Viewport } from 'next'
import { connection } from 'next/server'
import { socialMetadata } from '@/lib/seo/metadata'
import { getSiteOrigin } from '@/lib/seo/origin'
import './fonts.css'
import './globals.css'

const title = 'Trattoria Costantina — Cuisine italienne à Hénin-Beaumont'
const description =
  'Trattoria Costantina, cuisine italienne faite maison à Hénin-Beaumont, inspirée des recettes de Nonna Costantina et de la région des Pouilles.'

// Defaults for every route; the canonical "/" is the home page's and is overridden by the other public pages.
export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(getSiteOrigin()),
    title,
    description,
    alternates: { canonical: '/' },
    ...socialMetadata({ title, description, path: '/' }),
  }
}

export const viewport: Viewport = {
  themeColor: '#2C1A0E',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The per-request CSP nonce requires dynamic rendering on every route.
  await connection()

  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
