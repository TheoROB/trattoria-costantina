import { resolveAppOrigin } from '@/lib/security/origin'

// Domain announced in .env.example. Still to be confirmed by the client before launch; production
// sets APP_ORIGIN anyway (required by the admin photo upload).
export const DEFAULT_SITE_ORIGIN = 'https://trattoriacostantina.fr'

// Public origin used for canonical URLs, Open Graph, the sitemap and structured data.
export function getSiteOrigin(appOrigin = process.env.APP_ORIGIN) {
  return resolveAppOrigin(appOrigin) ?? DEFAULT_SITE_ORIGIN
}
