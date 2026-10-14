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

for (const path of ['/', '/images/logo/160.png', '/fonts/does-not-exist.woff2']) {
  test(`baseline hardening headers on ${path}`, async ({ request }) => {
    const h = (await request.get(path)).headers()
    expect(h['x-content-type-options']).toBe('nosniff')
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(h['x-frame-options']).toBe('DENY')
    expect(h['strict-transport-security']).toBe('max-age=31536000; includeSubDomains')
    expect(h['x-powered-by']).toBeUndefined()
  })
}

// Route Handlers are outside the proxy matcher (no CSP): the static headers still come from next.config.ts.
test('media and admin API route handlers keep the baseline headers', async ({ request }) => {
  const media = await request.get('/media/menu/0123456789abcdef0123456789abcdef-160.webp')
  const api = await request.post('/api/admin/menu/1/photo')
  for (const res of [media, api]) {
    const h = res.headers()
    expect(h['x-content-type-options']).toBe('nosniff')
    expect(h['x-frame-options']).toBe('DENY')
    expect(h['strict-transport-security']).toBe('max-age=31536000; includeSubDomains')
    expect(h['x-powered-by']).toBeUndefined()
  }
  expect(media.status()).toBe(404)
  expect(media.headers()['cache-control']).toBe('no-store')
  expect(api.status()).toBe(401)
  expect(api.headers()['cache-control']).toContain('no-store')
  expect(api.headers()['x-robots-tag']).toBe('noindex, nofollow')
})

for (const name of ['..%2F..%2Fetc%2Fpasswd', '..%2F.env.local', '0123456789abcdef0123456789abcdef-160.webp%00.png']) {
  test(`media route refuses ${name}`, async ({ request }) => {
    const res = await request.get(`/media/menu/${name}`)
    expect(res.status()).toBe(404)
    expect(res.headers()['cache-control']).toBe('no-store')
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
  // Only the expected DISH widget document may leave the origin.
  const external = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .filter(
        (u) =>
          !u.startsWith(location.origin) &&
          !u.startsWith(
            'https://reservation.dish.co/widget/hydra-0ab49cf0-0e40-11f0-b2b0-112fd36a4b37',
          ),
      ),
  )
  expect(external).toEqual([])
})
