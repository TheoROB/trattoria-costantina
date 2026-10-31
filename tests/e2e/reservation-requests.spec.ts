import { expect, test, type Page, type Request } from '@playwright/test'

// "Demandes de réservation": every effective opening of the DISH widget, from every entry point, posts exactly one
// anonymous event. DISH is stubbed: nothing leaves the machine, no reservation is ever made.
test.beforeEach(async ({ page }) => {
  await page.route('https://reservation.dish.co/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>DISH</title><p>Widget</p>' }),
  )
})

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
] as const

// Longer than the inline dwell time (1 s): enough for a duplicate to show up if there were one.
const SETTLE_MS = 1600

function recordOpenings(page: Page) {
  const sent: Request[] = []
  page.on('request', (r) => {
    if (r.url().endsWith('/api/reservation-requests')) sent.push(r)
  })
  return sent
}

async function expectOpenings(sent: Request[], count: number) {
  await expect.poll(() => sent.length, { timeout: 5000 }).toBe(count)
  await new Promise((r) => setTimeout(r, SETTLE_MS))
  expect(sent.length).toBe(count)
}

const trigger = (page: Page) => page.getByRole('button', { name: 'Réserver une table' })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Réserver une table' })

for (const viewport of VIEWPORTS) {
  test.describe(viewport.name, () => {
    test.use({ viewport })

    for (const path of ['/', '/carte', '/mentions-legales']) {
      test(`floating button on ${path}: every opening counts once, reopening counts again`, async ({ page, context, baseURL }) => {
        // A cookie in the browser must not travel with the event.
        await context.addCookies([{ name: 'tc_admin', value: 'not-sent', url: baseURL! }])
        const sent = recordOpenings(page)
        await page.goto(path)
        await expectOpenings(sent, 0)

        await trigger(page).click()
        await expect(dialog(page)).toBeVisible()
        await expectOpenings(sent, 1)
        await dialog(page).getByRole('button', { name: 'Fermer' }).click()
        await expect(dialog(page)).toBeHidden()

        await trigger(page).click()
        await expectOpenings(sent, 2)
        await page.keyboard.press('Escape')
        await trigger(page).click()
        await expectOpenings(sent, 3)
        // Closing never counts (backdrop click on desktop; the dialog fills the phone screen).
        if (viewport.name === 'desktop') await page.mouse.click(2, 2)
        else await page.keyboard.press('Escape')
        await expect(dialog(page)).toBeHidden()
        await expectOpenings(sent, 3)

        const request = sent[0]
        expect(request.method()).toBe('POST')
        expect(request.postData()).toBe(JSON.stringify({ path }))
        const headers = await request.allHeaders()
        expect(headers.origin).toBe(new URL(baseURL!).origin)
        expect(headers['content-type']).toBe('application/json')
        expect(headers.cookie).toBeUndefined()
        expect((await request.response())?.status()).toBe(204)
      })
    }

    test('re-renders do not count: menu toggle, scrolling, resizing', async ({ page }) => {
      const sent = recordOpenings(page)
      await page.goto('/carte')
      await trigger(page).click()
      await expectOpenings(sent, 1)
      await page.keyboard.press('Escape')
      if (viewport.name === 'mobile') {
        await page.locator('.nav-toggle').click()
        await page.locator('.nav-toggle').click()
      }
      await page.mouse.wheel(0, 600)
      await page.setViewportSize({ width: viewport.width - 10, height: viewport.height })
      await expectOpenings(sent, 1)
    })
  })
}

// Every link to the home reservation section, desktop and mobile. The inline widget counts once it is on screen.
const INLINE_ENTRIES: { name: string; viewport: (typeof VIEWPORTS)[number]; from: string; open: (page: Page) => Promise<void> }[] = [
  { name: 'navbar button', viewport: VIEWPORTS[0], from: '/', open: (p) => p.locator('#navbar .nav-cta').click() },
  { name: 'navbar link', viewport: VIEWPORTS[0], from: '/', open: (p) => p.locator('#navbar .nav-links').getByRole('link', { name: 'Réserver' }).click() },
  { name: 'navbar button from /carte', viewport: VIEWPORTS[0], from: '/carte', open: (p) => p.locator('#navbar .nav-cta').click() },
  {
    name: 'mobile menu link', viewport: VIEWPORTS[1], from: '/',
    open: async (p) => {
      await p.locator('.nav-toggle').click()
      await p.locator('#navbar .nav-links').getByRole('link', { name: 'Réserver' }).click()
    },
  },
  {
    name: 'mobile menu link from /mentions-legales', viewport: VIEWPORTS[1], from: '/mentions-legales',
    open: async (p) => {
      await p.locator('.nav-toggle').click()
      await p.locator('#navbar .nav-links').getByRole('link', { name: 'Réserver' }).click()
    },
  },
  ...VIEWPORTS.flatMap((viewport) => [
    { name: 'hero button', viewport, from: '/', open: (p: Page) => p.locator('#hero a[href="#reservation"]').click() },
    { name: 'famille button', viewport, from: '/', open: (p: Page) => p.locator('.section-famille a[href="#reservation"]').click() },
    { name: 'contact link', viewport, from: '/', open: (p: Page) => p.locator('#contact a[href="/#reservation"]').click() },
    { name: 'footer link', viewport, from: '/carte', open: (p: Page) => p.locator('footer a[href="/#reservation"]').click() },
    {
      name: 'scrolling down', viewport, from: '/',
      open: (p: Page) => p.locator('.reservation-form-card iframe').scrollIntoViewIfNeeded(),
    },
  ]),
]

for (const entry of INLINE_ENTRIES) {
  test(`${entry.viewport.name}: ${entry.name} on ${entry.from} counts one opening of the inline widget`, async ({ page }) => {
    await page.setViewportSize(entry.viewport)
    const sent = recordOpenings(page)
    await page.goto(entry.from)
    await expectOpenings(sent, 0)
    await entry.open(page)
    await expect(page.locator('.reservation-form-card iframe')).toBeInViewport({ ratio: 0.3 })
    await expectOpenings(sent, 1)
    expect(sent[0].postData()).toBe('{"path":"/"}')
    expect(new URL(page.url()).pathname).toBe('/')
    expect((await sent[0].response())?.status()).toBe(204)
  })
}

test.describe('inline widget', () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}: leaving the screen then coming back counts again; a quick scroll past does not`, async ({ page }) => {
      await page.setViewportSize(viewport)
      const sent = recordOpenings(page)
      await page.goto('/')
      const iframe = page.locator('.reservation-form-card iframe')

      // Scrolled past in well under a second.
      await iframe.scrollIntoViewIfNeeded()
      await page.waitForTimeout(150)
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      await expectOpenings(sent, 0)

      await iframe.scrollIntoViewIfNeeded()
      await expectOpenings(sent, 1)
      // Partly off screen but never gone: same opening.
      await page.mouse.wheel(0, 150)
      await expectOpenings(sent, 1)

      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      await expect(iframe).not.toBeInViewport()
      await iframe.scrollIntoViewIfNeeded()
      await expectOpenings(sent, 2)
    })
  }

  test('the floating button and the inline widget are counted separately, once each', async ({ page }) => {
    const sent = recordOpenings(page)
    await page.goto('/')
    await trigger(page).click()
    await expectOpenings(sent, 1)
    await page.keyboard.press('Escape')
    await page.locator('#hero a[href="#reservation"]').click()
    await expectOpenings(sent, 2)
  })
})

test('the endpoint refuses cross-origin and malformed requests', async ({ request, baseURL }) => {
  const url = '/api/reservation-requests'
  const origin = new URL(baseURL!).origin
  const json = { 'content-type': 'application/json' }
  expect((await request.post(url, { headers: { ...json, origin: 'https://evil.example' }, data: '{"path":"/"}' })).status()).toBe(403)
  expect((await request.post(url, { headers: json, data: '{"path":"/"}' })).status()).toBe(403)
  expect((await request.post(url, { headers: { ...json, origin }, data: '{"path":"/carte?x=1"}' })).status()).toBe(400)
  expect((await request.post(url, { headers: { 'content-type': 'text/plain', origin }, data: '{"path":"/"}' })).status()).toBe(415)
  expect((await request.get(url)).status()).toBe(405)
})
