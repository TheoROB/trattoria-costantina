import type { NextConfig } from 'next'
import { staticSecurityHeaders } from './lib/security/headers'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: staticSecurityHeaders }]
  },
}

export default nextConfig
