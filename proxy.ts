import { NextResponse, type NextRequest } from 'next/server'
import { buildContentSecurityPolicy } from '@/lib/security/headers'

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = buildContentSecurityPolicy({ nonce, isDev: process.env.NODE_ENV === 'development' })

  // Next.js reads the nonce from the request CSP header and applies it to its own scripts.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|images/|media/|fonts/|favicon.ico|robots.txt|sitemap.xml).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
