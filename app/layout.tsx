import type { Metadata } from 'next'
import { connection } from 'next/server'
import './fonts.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'Trattoria Costantina — Cuisine italienne à Hénin-Beaumont',
  description:
    'Trattoria Costantina, cuisine italienne authentique à Hénin-Beaumont inspirée des recettes de Nonna Costantina des Pouilles.',
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
