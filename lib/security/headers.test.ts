import { describe, expect, it } from 'vitest'
import { buildContentSecurityPolicy, staticSecurityHeaders } from './headers'

const nonce = 'dGVzdC1ub25jZQ=='

function directives(csp: string) {
  return Object.fromEntries(
    csp
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...values] = d.split(/\s+/)
        return [name, values]
      }),
  )
}

describe('buildContentSecurityPolicy', () => {
  it('locks scripts to the per-request nonce in production', () => {
    const d = directives(buildContentSecurityPolicy({ nonce, isDev: false }))
    expect(d['script-src']).toEqual(["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"])
    expect(d['style-src']).toEqual(["'self'", `'nonce-${nonce}'`])
  })

  it('never allows unsafe-inline or unsafe-eval in production', () => {
    const csp = buildContentSecurityPolicy({ nonce, isDev: false })
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).not.toContain('unsafe-eval')
  })

  it('allows unsafe-eval and inline styles only in development', () => {
    const d = directives(buildContentSecurityPolicy({ nonce, isDev: true }))
    expect(d['script-src']).toContain("'unsafe-eval'")
    expect(d['style-src']).toContain("'unsafe-inline'")
  })

  it('only allows the DISH reservation origin as a frame source', () => {
    const d = directives(buildContentSecurityPolicy({ nonce, isDev: false }))
    expect(d['frame-src']).toEqual(['https://reservation.dish.co'])
  })

  it('forbids framing, plugins, base hijacking and foreign form targets', () => {
    const d = directives(buildContentSecurityPolicy({ nonce, isDev: false }))
    expect(d['default-src']).toEqual(["'self'"])
    expect(d['frame-ancestors']).toEqual(["'none'"])
    expect(d['object-src']).toEqual(["'none'"])
    expect(d['base-uri']).toEqual(["'self'"])
    expect(d['form-action']).toEqual(["'self'"])
    expect(d['img-src']).toEqual(["'self'", 'data:'])
    expect(d['font-src']).toEqual(["'self'"])
    expect(d['connect-src']).toEqual(["'self'"])
  })

  it('upgrades insecure requests only outside development', () => {
    expect(buildContentSecurityPolicy({ nonce, isDev: false })).toContain('upgrade-insecure-requests')
    expect(buildContentSecurityPolicy({ nonce, isDev: true })).not.toContain('upgrade-insecure-requests')
  })
})

describe('staticSecurityHeaders', () => {
  it('sets the baseline hardening headers', () => {
    const h = Object.fromEntries(staticSecurityHeaders.map(({ key, value }) => [key, value]))
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(h['X-Frame-Options']).toBe('DENY')
    expect(h['Cross-Origin-Opener-Policy']).toBe('same-origin')
    expect(h['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains')
    expect(h['Permissions-Policy']).toContain('camera=()')
    expect(h['Permissions-Policy']).toContain('geolocation=()')
  })
})
