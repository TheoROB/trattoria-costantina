import type { NextConfig } from 'next'
import { adminHeaders, staticSecurityHeaders } from './lib/security/headers'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: staticSecurityHeaders },
      { source: '/admin/:path*', headers: adminHeaders },
      { source: '/api/admin/:path*', headers: adminHeaders },
    ]
  },
}

export default nextConfig
