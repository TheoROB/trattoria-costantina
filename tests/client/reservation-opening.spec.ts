import { expect, test, type Page, type Request } from '@playwright/test'

// Client-side counting of "demandes de réservation", against the real local build, without any database.
// STUBS (declared, not a simulation of persistence): the DISH iframe is answered by page.route with a placeholder
// page, held until the test releases it; POST /api/reservation-requests is answered 204 by page.route and never
// reaches the server. These tests only prove *when the client sends* an event, not that anything is stored.

const DISH = 'https://reservation.dish.co/**'
const ENDPOINT = '**/api/reservation-requests'
// Longer than the inline dwell time (1 s): enough for an early or duplicate event to show up.
const SETTLE_MS = 1600

const MOBILE = { width: 390, height: 844 }

test.beforeEach(async ({ page }) => {
  await page.route(ENDPOINT, (route) => route.fulfill({ status: 204 }))
})

/** DISH answers only once `release()` is called (every iframe request until then waits). */
async function holdDish(page: Page) {
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  await page.route(DISH, async (route) => {
    await gate
    await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>DISH stub</title><p>Stub</p>' })
  })
  return release
}

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

// With DISH held, the home page's `load` never fires (the inline iframe is part of it): wait for hydration instead,
// i.e. React's fiber on a client component's node, so the trackers' listeners are attached.
async function gotoHydrated(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => {
    const toggle = document.querySelector('.nav-toggle')
    return !!toggle && Object.keys(toggle).some((k) => k.startsWith('__reactFiber'))
  })
}

const trigger = (page: Page) => page.getByRole('button', { name: 'Réserver une table' })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Réserver une table' })
const close = (page: Page) => dialog(page).getByRole('button', { name: 'Fermer' }).click()
const inline = (page: Page) => page.locator('.reservation-form-card iframe')

test.describe('floating button + modal', () => {
  test('delayed load: nothing while the iframe is loading, one event once it has loaded', async ({ page }) => {
    const release = await holdDish(page)
    const sent = recordOpenings(page)
    await page.goto('/carte')
    await trigger(page).click()
    await expect(dialog(page)).toBeVisible()
    await expectOpenings(sent, 0)
    release()
    await expectOpenings(sent, 1)
    expect(sent[0].postData()).toBe('{"path":"/carte"}')
  })

  test('closed before load: never counted, even when the load ends afterwards; later reopenings count', async ({ page }) => {
    const release = await holdDish(page)
    const sent = recordOpenings(page)
    await page.goto('/carte')
    await trigger(page).click()
    await close(page)
    await expect(dialog(page)).toBeHidden()
    release()
    await expectOpenings(sent, 0)

    // The iframe is kept mounted and is now loaded: each reopening is visible and loaded right away.
    await trigger(page).click()
    await expectOpenings(sent, 1)
    await page.keyboard.press('Escape')
    await trigger(page).click()
    await expectOpenings(sent, 2)
  })

  test('reopened while still loading: one event, at load', async ({ page }) => {
    const release = await holdDish(page)
    const sent = recordOpenings(page)
    await page.goto('/carte')
    await trigger(page).click()
    await page.keyboard.press('Escape')
    await trigger(page).click()
    await expectOpenings(sent, 0)
    release()
    await expectOpenings(sent, 1)
  })

  test('re-renders while pending (scroll, resize) neither count nor drop the opening', async ({ page }) => {
    const release = await holdDish(page)
    const sent = recordOpenings(page)
    await page.goto('/carte')
    await trigger(page).click()
    await page.mouse.wheel(0, 400)
    await page.setViewportSize({ width: 1200, height: 760 })
    await expectOpenings(sent, 0)
    release()
    await expectOpenings(sent, 1)
  })

  // Documents a limit, it does not endorse it: a network failure still ends with Chromium's error page firing
  // `load` on the cross-origin iframe, which the parent cannot tell from DISH's page. Counted as an opening.
  test('network failure of the iframe: Chromium fires load on its error page, so the opening is counted', async ({ page }) => {
    await page.route(DISH, (route) => route.abort('connectionrefused'))
    const sent = recordOpenings(page)
    await page.goto('/carte')
    await trigger(page).click()
    await expectOpenings(sent, 1)
  })

  test('aborted before any response, dialog closed: nothing', async ({ page }) => {
    await holdDish(page) // never released
    const sent = recordOpenings(page)
    await page.goto('/carte')
    await trigger(page).click()
    await close(page)
    await expectOpenings(sent, 0)
  })
})

test.describe('inline widget (home #reservation)', () => {
  test('delayed load: in view but loading counts nothing; counts once one dwell after load', async ({ page }) => {
    const release = await holdDish(page)
    const sent = recordOpenings(page)
    await gotoHydrated(page, '/')
    await inline(page).scrollIntoViewIfNeeded()
    await expect(inline(page)).toBeInViewport({ ratio: 0.5 })
    await expectOpenings(sent, 0)
    release()
    await expectOpenings(sent, 1)
    expect(sent[0].postData()).toBe('{"path":"/"}')
  })

  test('scrolled away before load: nothing; coming back after load counts once', async ({ page }) => {
    const release = await holdDish(page)
    const sent = recordOpenings(page)
    await gotoHydrated(page, '/')
    await inline(page).scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await expect(inline(page)).not.toBeInViewport()
    release()
    await expectOpenings(sent, 0)
    await inline(page).scrollIntoViewIfNeeded()
    await expectOpenings(sent, 1)
  })

  test('mobile menu open over the widget before the first count: suspended, then one event once closed', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    const release = await holdDish(page)
    const sent = recordOpenings(page)
    await gotoHydrated(page, '/')
    await inline(page).scrollIntoViewIfNeeded()
    await page.locator('.nav-toggle').click()
    await expect(page.locator('.nav-toggle')).toHaveAttribute('aria-expanded', 'true')
    release()
    await expectOpenings(sent, 0)

    await page.locator('.nav-toggle').click()
    await expect(page.locator('.nav-toggle')).toHaveAttribute('aria-expanded', 'false')
    await expectOpenings(sent, 1)
    // Covering and uncovering an already counted widget is not a new opening.
    await page.locator('.nav-toggle').click()
    await page.locator('.nav-toggle').click()
    await expectOpenings(sent, 1)
  })

  test('modal open over the inline widget: the inline one waits until the modal closes', async ({ page }) => {
    await page.route(DISH, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>DISH stub</title><p>Stub</p>' }),
    )
    const sent = recordOpenings(page)
    await page.goto('/')
    await trigger(page).click()
    await expectOpenings(sent, 1) // the modal itself
    // Scroll the page under the modal so the inline widget is on screen, loaded, but covered.
    await page.evaluate(() => document.querySelector('.reservation-form-card iframe')!.scrollIntoView({ block: 'center' }))
    await expect(inline(page)).toBeInViewport({ ratio: 0.5 })
    await expectOpenings(sent, 1)
    await close(page)
    await expectOpenings(sent, 2)
  })
})
