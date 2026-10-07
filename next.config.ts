import type { NextConfig } from 'next'
import { adminHeaders, staticSecurityHeaders } from './lib/security/headers'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Menu photos up to 10 MB (lib/media/limits.ts) plus multipart overhead.
  experimental: {
    serverActions: { bodySizeLimit: '11mb' },
    proxyClientMaxBodySize: '11mb',
  },
  async headers() {
    return [
      { source: '/:path*', headers: staticSecurityHeaders },
      { source: '/admin/:path*', headers: adminHeaders },
    ]
  },
}

export default nextConfig
