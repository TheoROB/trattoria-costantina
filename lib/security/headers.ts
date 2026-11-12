// Origin of the DISH Reservation iframe (see components/sections/Reservation.tsx).
export const DISH_ORIGIN = 'https://reservation.dish.co'

// reCAPTCHA Enterprise (contact form, lib/contact/recaptcha-client.ts), as documented by Google: enterprise.js and the
// scripts it loads, and its invisible iframes. The assessment is created server-side: no connect-src is needed.
export const RECAPTCHA_SCRIPT_SOURCES = ['https://www.google.com/recaptcha/', 'https://www.gstatic.com/recaptcha/']
export const RECAPTCHA_FRAME_SOURCES = ['https://www.google.com/recaptcha/', 'https://recaptcha.google.com/recaptcha/']

// `recaptcha`: only when a site key is embedded in the build, otherwise Google is not allowed at all.
export function buildContentSecurityPolicy({ nonce, isDev, recaptcha = false }: { nonce: string; isDev: boolean; recaptcha?: boolean }) {
  // With 'strict-dynamic', CSP3 browsers ignore host sources and trust what the nonce'd scripts load; the hosts only
  // serve older browsers.
  const recaptchaScripts = recaptcha ? ` ${RECAPTCHA_SCRIPT_SOURCES.join(' ')}` : ''
  const recaptchaFrames = recaptcha ? ` ${RECAPTCHA_FRAME_SOURCES.join(' ')}` : ''
  const directives = [
    "default-src 'self'",
    // React needs eval only in development for debugging stacks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}${recaptchaScripts}`,
    // Dev overlay injects inline styles without nonce.
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    `frame-src ${DISH_ORIGIN}${recaptchaFrames}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]
  if (!isDev) directives.push('upgrade-insecure-requests')
  return directives.join('; ')
}

// Applied to every response (pages and static assets) via next.config.ts.
export const staticSecurityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  {
    key: 'Permissions-Policy',
    // No `interest-cohort`: FLoC is gone and Chrome reports the unknown feature as a header error.
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
]

// /admin only (next.config.ts): never indexed, never stored by browsers or shared caches.
export const adminHeaders = [
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
]
