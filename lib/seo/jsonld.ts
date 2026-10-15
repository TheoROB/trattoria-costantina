import { openingHours, site } from '@/lib/site'
import { OG_IMAGE } from './metadata'

// Brand logo (public/images/logo), the largest PNG rendition.
const LOGO_PATH = '/images/logo/480.png'

// One OpeningHoursSpecification per time slot, listing every day that shares it.
function buildOpeningHoursSpecification() {
  const specs = new Map<string, { '@type': 'OpeningHoursSpecification'; dayOfWeek: string[]; opens: string; closes: string }>()
  for (const { dayOfWeek, slots } of openingHours) {
    for (const { opens, closes } of slots) {
      const key = `${opens}-${closes}`
      const spec = specs.get(key) ?? { '@type': 'OpeningHoursSpecification', dayOfWeek: [], opens, closes }
      spec.dayOfWeek.push(dayOfWeek)
      specs.set(key, spec)
    }
  }
  return [...specs.values()]
}

// schema.org Restaurant built from lib/site.ts only. Price range and social profiles are
// deliberately absent until the client confirms them.
export function buildRestaurantJsonLd(origin: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: site.name,
    url: `${origin}/`,
    image: `${origin}${OG_IMAGE.url}`,
    logo: `${origin}${LOGO_PATH}`,
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
    openingHoursSpecification: buildOpeningHoursSpecification(),
    acceptsReservations: true,
    hasMenu: `${origin}/carte`,
    foundingDate: site.openingDate,
  }
}

// Escapes "<" as recommended by the Next.js JSON-LD guide, so a value cannot close the script element.
export function serializeJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
