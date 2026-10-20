import type { NextConfig } from 'next'
import { adminHeaders, staticSecurityHeaders } from './lib/security/headers'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: staticSecurityHeaders },
      // Photo variants keep their file name when a photo is replaced, so no `immutable`: browsers reuse them for a day,
      // then revalidate in the background (Next's default for public/ is max-age=0, i.e. a request per image per visit).
      { source: '/images/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }] },
      { source: '/admin/:path*', headers: adminHeaders },
      { source: '/api/admin/:path*', headers: adminHeaders },
    ]
  },
}

export default nextConfig
