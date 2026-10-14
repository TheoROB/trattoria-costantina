import { site } from '@/lib/site'
import { OG_IMAGE } from './metadata'

// schema.org Restaurant built from lib/site.ts only. Opening hours, price range and social profiles
// are deliberately absent until the client confirms them.
export function buildRestaurantJsonLd(origin: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: site.name,
    url: `${origin}/`,
    image: `${origin}${OG_IMAGE.url}`,
    telephone: site.phone.href.replace(/^tel:/, ''),
    email: site.email.display,
    address: {
      '@type': 'PostalAddress',
      streetAddress: site.address.street,
      postalCode: site.address.postalCode,
      addressLocality: site.address.city,
      addressCountry: 'FR',
    },
    servesCuisine: 'Italian',
    acceptsReservations: true,
    hasMenu: `${origin}/carte`,
    foundingDate: site.openingDate,
  }
}

// Escapes "<" as recommended by the Next.js JSON-LD guide, so a value cannot close the script element.
export function serializeJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
