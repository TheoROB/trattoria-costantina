import type { MetadataRoute } from 'next'
import { connection } from 'next/server'
import { getSiteOrigin } from '@/lib/seo/origin'
import { buildSitemap } from '@/lib/seo/routes'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Rendered per request so that the origin comes from the runtime APP_ORIGIN, not the build env.
  await connection()
  return buildSitemap(getSiteOrigin())
}
