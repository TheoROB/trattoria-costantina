import type { MetadataRoute } from 'next'

// Indexable pages only: /mentions-legales stays out while it is noindex, /admin never appears.
const PUBLIC_PATHS = ['/', '/carte']

export function buildSitemap(origin: string): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({ url: `${origin}${path}` }))
}

export function buildRobots(origin: string): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api'] },
    sitemap: `${origin}/sitemap.xml`,
  }
}
