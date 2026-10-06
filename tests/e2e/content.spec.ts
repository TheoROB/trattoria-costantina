import { expect, test, type Page } from '@playwright/test'

const PLACEHOLDERS = [
  '42 58 73 21',
  'bonjour@trattoria-costantina.fr',
  'TikTok',
  'La vraie cuisine, c&#x27;est celle',
  "La vraie cuisine, c'est celle",
  'chaque matin au marché',
  '© 2024',
]

const CONTACT_PLACEHOLDERS = ['42 58 73 21', 'bonjour@trattoria-costantina.fr']

const SECTION_IMAGES = '#navbar img, #hero img, #histoire img, .section-famille img, #trouver img, .footer img'

function collectErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

test('home page contains no placeholder content', async ({ page, request }) => {
  const html = await (await request.get('/')).text()
  for (const s of PLACEHOLDERS) {
    if (!CONTACT_PLACEHOLDERS.includes(s)) expect(html, s).not.toContain(s)
  }
  // TODO(integration): #reservation (Reservation.tsx, another work package) still holds the
  // mockup phone/email; check the full HTML once it uses lib/site.ts.
  await page.goto('/')
  const rendered = await page
    .locator('body > nav, body > section:not(#reservation), body > footer')
    .evaluateAll((els) => els.map((e) => e.outerHTML).join('\n'))
  for (const s of PLACEHOLDERS) expect(rendered, s).not.toContain(s)
})

test('real phone and email are displayed and clickable in "Nous trouver"', async ({ page }) => {
  await page.goto('/')
  const trouver = page.locator('#trouver')
  await expect(trouver.locator('.contact-info-large a[href="tel:+33978813295"]')).toHaveText('09 78 81 32 95')
  await expect(trouver.locator('.contact-info-large a[href="mailto:trattoria.costantina@gmail.com"]')).toHaveText(
    'trattoria.costantina@gmail.com',
  )
  await expect(page.locator('.section-famille a[href="tel:+33978813295"]')).toBeVisible()
})

test('copyright year is the current year', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.footer-bottom')).toContainText(`© ${new Date().getFullYear()} Trattoria Costantina`)
})

test('section images have dimensions, alt text and the right loading strategy', async ({ page }) => {
  await page.goto('/')
  const imgs = await page.locator(SECTION_IMAGES).evaluateAll((els) =>
    els.map((e) => ({
      src: e.getAttribute('src'),
      width: e.getAttribute('width'),
      height: e.getAttribute('height'),
      alt: e.getAttribute('alt'),
      loading: e.getAttribute('loading'),
      fetchpriority: e.getAttribute('fetchpriority'),
      hero: !!e.closest('#hero'),
      nav: !!e.closest('#navbar'),
      inPicture: e.parentElement?.tagName === 'PICTURE',
    })),
  )
  expect(imgs.length).toBeGreaterThanOrEqual(7)
  for (const img of imgs) {
    expect(Number(img.width), img.src!).toBeGreaterThan(0)
    expect(Number(img.height), img.src!).toBeGreaterThan(0)
    expect(img.alt?.trim(), img.src!).toBeTruthy()
    expect(img.inPicture, img.src!).toBe(true)
    if (img.hero) {
      expect(img.loading).not.toBe('lazy')
      expect(img.fetchpriority).toBe('high')
    } else if (!img.nav) {
      // The navbar logo is above the fold: eager, but not high priority.
      expect(img.loading, img.src!).toBe('lazy')
    }
  }
  // Every photo offers AVIF and WebP sources.
  const photoPictures = page.locator('#hero picture, #histoire picture, .section-famille picture, #trouver picture')
  for (const pic of await photoPictures.all()) {
    await expect(pic.locator('source[type="image/avif"]').first()).toHaveAttribute('srcset', /\.avif/)
    await expect(pic.locator('source[type="image/webp"]').first()).toHaveAttribute('srcset', /\.webp/)
  }
})

for (const width of [375, 1280]) {
  test(`no image heavier than 400 KB is served on / at ${width}px`, async ({ page }) => {
    const sizes: { url: string; bytes: number }[] = []
    page.on('response', async (res) => {
      if (res.request().resourceType() !== 'image') return
      const body = await res.body().catch(() => Buffer.alloc(0))
      sizes.push({ url: res.url(), bytes: body.length })
    })
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/', { waitUntil: 'networkidle' })
    // Scroll through the page so lazy images load too.
    for (let y = 0; y < 12000; y += 600) {
      await page.mouse.wheel(0, 600)
      await page.waitForTimeout(50)
    }
    await page.waitForLoadState('networkidle')
    expect(sizes.length).toBeGreaterThan(0)
    expect(sizes.filter((s) => !s.url.includes('/images/food-') && s.bytes > 400 * 1024)).toEqual([])
  })
}

test('mentions légales page responds, shows the SIRET and is not indexed', async ({ page }) => {
  const res = await page.goto('/mentions-legales')
  expect(res?.status()).toBe(200)
  await expect(page.locator('main')).toContainText('980 825 020 00012')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
})

test('navbar and footer internal links use the /#anchor format', async ({ page }) => {
  await page.goto('/')
  const hrefs = await page
    .locator('#navbar a, .footer a')
    .evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''))
  const internal = hrefs.filter((h) => !/^(tel:|mailto:|https?:)/.test(h))
  expect(internal.length).toBeGreaterThan(0)
  for (const h of internal) expect(h).toMatch(/^\/(#[a-z-]+|mentions-legales)?$/)
  expect(await page.locator('.nav-logo').getAttribute('href')).toBe('/')
  expect(hrefs).toContain('/mentions-legales')
  expect(hrefs).not.toContain('#')
})

for (const path of ['/', '/mentions-legales']) {
  test(`${path} loads without CSP violations or console errors`, async ({ page }) => {
    const errors = collectErrors(page)
    const res = await page.goto(path, { waitUntil: 'networkidle' })
    expect(errors).toEqual([])
    // Inline style attributes in the server HTML would be blocked by the CSP.
    expect(await res!.text()).not.toMatch(/<[^>]+\sstyle=/)
  })
}

test('<picture> wrappers keep the mockup layout (Nous trouver photos side by side)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  const boxes = await page.locator('.trouver-photos img').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top))
  expect(boxes).toHaveLength(2)
  expect(boxes[0]).toBe(boxes[1])
})
