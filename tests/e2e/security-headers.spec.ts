import { expect, test } from '@playwright/test'

test('home page sends a nonce-based CSP without unsafe script sources', async ({ request }) => {
  const res = await request.get('/')
  expect(res.status()).toBe(200)
  const csp = res.headers()['content-security-policy']
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/)
  expect(csp).not.toContain('unsafe-inline')
  expect(csp).not.toContain('unsafe-eval')
  expect(csp).toContain('frame-src https://reservation.dish.co')
  expect(csp).toContain("frame-ancestors 'none'")
})

test('each request gets a fresh nonce', async ({ request }) => {
  const nonceOf = async () => (await request.get('/')).headers()['content-security-policy'].match(/'nonce-([^']+)'/)?.[1]
  const [a, b] = [await nonceOf(), await nonceOf()]
  expect(a).toBeTruthy()
  expect(a).not.toBe(b)
})

for (const path of ['/', '/images/logo.png', '/fonts/does-not-exist.woff2']) {
  test(`baseline hardening headers on ${path}`, async ({ request }) => {
    const h = (await request.get(path)).headers()
    expect(h['x-content-type-options']).toBe('nosniff')
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(h['x-frame-options']).toBe('DENY')
    expect(h['strict-transport-security']).toBe('max-age=31536000; includeSubDomains')
    expect(h['x-powered-by']).toBeUndefined()
  })
}

test('unknown routes return a real 404 (no SPA rewrite to the home page)', async ({ request }) => {
  expect((await request.get('/this-page-does-not-exist')).status()).toBe(404)
})

test('page loads with the CSP enforced and no console errors or violations', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  expect(errors).toEqual([])
  // Fonts are self-hosted: no request may leave the origin.
  const external = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((r) => r.name).filter((u) => !u.startsWith(location.origin)),
  )
  expect(external).toEqual([])
})
