import { expect, test } from '@playwright/test'

// The e2e server runs with APP_ORIGIN = baseURL (playwright.config.ts).
const pages = [
  { path: '/', title: 'Trattoria Costantina — Cuisine italienne à Hénin-Beaumont' },
  { path: '/carte', title: 'La carte — Trattoria Costantina, Hénin-Beaumont' },
]

for (const { path, title } of pages) {
  test(`${path} has its title, description, canonical and social card, and is indexable`, async ({ page, baseURL }) => {
    const res = await page.goto(path)
    const url = new URL(path, baseURL).href
    await expect(page).toHaveTitle(title)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Hénin-Beaumont/)
    // Next writes the root URL without its trailing slash: compare normalised URLs.
    expect(new URL((await page.locator('link[rel="canonical"]').getAttribute('href'))!).href).toBe(url)
    expect(new URL((await page.locator('meta[property="og:url"]').getAttribute('content'))!).href).toBe(url)
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', title)
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'fr_FR')
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', new URL('/images/hero/1280.webp', baseURL).href)
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr')

    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    expect(res?.headers()['x-robots-tag']).toBeUndefined()
  })
}

test('the Open Graph image is served', async ({ request }) => {
  const res = await request.get('/images/hero/1280.webp')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toBe('image/webp')
})

test('/mentions-legales stays out of the index and has its own canonical', async ({ page, baseURL }) => {
  await page.goto('/mentions-legales')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new URL('/mentions-legales', baseURL).href)
})

test('/admin/login is never indexed', async ({ page }) => {
  const res = await page.goto('/admin/login')
  expect(res?.headers()['x-robots-tag']).toBe('noindex, nofollow')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
})

test('robots.txt keeps crawlers out of /admin and /api and points to the sitemap', async ({ request, baseURL }) => {
  const res = await request.get('/robots.txt')
  expect(res.status()).toBe(200)
  const body = await res.text()
  expect(body).toContain('Disallow: /admin')
  expect(body).toContain('Disallow: /api')
  expect(body).toContain(`Sitemap: ${new URL('/sitemap.xml', baseURL).href}`)
})

test('sitemap.xml lists the public pages only', async ({ request, baseURL }) => {
  const res = await request.get('/sitemap.xml')
  expect(res.status()).toBe(200)
  const locs = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  expect(locs).toEqual([new URL('/', baseURL).href, new URL('/carte', baseURL).href])
})

test('the favicon and the Apple touch icon are declared and served', async ({ page, request }) => {
  await page.goto('/')
  for (const rel of ['icon', 'apple-touch-icon']) {
    const href = await page.locator(`link[rel="${rel}"][type="image/png"]`).first().getAttribute('href')
    const res = await request.get(href!)
    expect(res.status(), rel).toBe(200)
    expect(res.headers()['content-type'], rel).toBe('image/png')
  }
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#2C1A0E')
})

test('the home page carries no unsourced marketing claim', async ({ request }) => {
  const html = await (await request.get('/')).text()
  for (const claim of ['importés directement', 'Notre chef', 'inoubliable', 'authentique']) {
    expect(html, claim).not.toContain(claim)
  }
})

test('the home page exposes the Restaurant structured data', async ({ page, baseURL }) => {
  await page.goto('/')
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
  const restaurant = blocks.map((b) => JSON.parse(b)).find((d) => d['@type'] === 'Restaurant')
  expect(restaurant).toMatchObject({
    name: 'Trattoria Costantina',
    url: new URL('/', baseURL).href,
    telephone: '+33978813295',
    address: { postalCode: '62110', addressLocality: 'Hénin-Beaumont' },
  })
  expect(restaurant).not.toHaveProperty('openingHours')
  expect(restaurant).not.toHaveProperty('sameAs')
})
