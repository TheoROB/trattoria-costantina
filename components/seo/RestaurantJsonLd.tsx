import { buildRestaurantJsonLd, serializeJsonLd } from '@/lib/seo/jsonld'
import { getSiteOrigin } from '@/lib/seo/origin'

// A JSON-LD block is data, not executed script: the CSP nonce does not apply to it.
export function RestaurantJsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildRestaurantJsonLd(getSiteOrigin())) }}
    />
  )
}
