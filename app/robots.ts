import type { MetadataRoute } from 'next'
import { connection } from 'next/server'
import { getSiteOrigin } from '@/lib/seo/origin'
import { buildRobots } from '@/lib/seo/routes'

export default async function robots(): Promise<MetadataRoute.Robots> {
  // Rendered per request so that the origin comes from the runtime APP_ORIGIN, not the build env.
  await connection()
  return buildRobots(getSiteOrigin())
}
