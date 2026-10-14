import { expect, test, type Page } from '@playwright/test'

const PUBLIC_PAGES = ['/', '/carte', '/mentions-legales']

// The widget itself is covered by reservation.spec.ts: stub DISH so these tests stay offline.
test.beforeEach(async ({ page }) => {
  await page.route('https://reservation.dish.co/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>DISH</title><p>Widget</p>' }),
  )
})

const trigger = (page: Page) => page.getByRole('button', { name: 'Réserver une table' })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Réserver une table' })

for (const path of PUBLIC_PAGES) {
  test(`floating reservation button is visible on ${path}`, async ({ page }) => {
    await page.goto(path)
    await expect(trigger(page)).toBeVisible()
    await expect(trigger(page)).toHaveAttribute('aria-haspopup', 'dialog')
  })
}

test('floating reservation button is absent from the admin', async ({ page }) => {
  await page.goto('/admin/login')
  await expect(page.locator('.reservation-cta')).toHaveCount(0)
})

test('loads the DISH iframe only once the dialog is opened', async ({ page }) => {
  await page.goto('/carte')
  const iframe = page.locator('.reservation-cta-dialog iframe')
  await expect(iframe).toHaveCount(0)

  await trigger(page).click()
  await expect(dialog(page)).toBeVisible()
  await expect(iframe).toHaveCount(1)
  await expect(iframe).toHaveAttribute('title', 'Réservation en ligne DISH')
  expect(new URL((await iframe.getAttribute('src'))!).origin).toBe('https://reservation.dish.co')
  await expect(dialog(page).getByRole('link', { name: '09 78 81 32 95' })).toBeVisible()
})

test('Escape closes the dialog and returns focus to the trigger', async ({ page }) => {
  await page.goto('/carte')
  await trigger(page).click()
  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page).getByRole('button', { name: 'Fermer' })).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()
  await expect(trigger(page)).toBeFocused()
})

test('close button closes the dialog and returns focus to the trigger', async ({ page }) => {
  await page.goto('/mentions-legales')
  await trigger(page).click()
  await dialog(page).getByRole('button', { name: 'Fermer' }).click()
  await expect(dialog(page)).toBeHidden()
  await expect(trigger(page)).toBeFocused()

  // Reopening keeps working.
  await trigger(page).click()
  await expect(dialog(page)).toBeVisible()
})

test('opens with the keyboard only', async ({ page }) => {
  await page.goto('/mentions-legales')
  await expect(trigger(page)).toBeVisible()
  for (let i = 0; i < 50; i++) {
    await page.keyboard.press('Tab')
    if (await trigger(page).evaluate((el) => el === document.activeElement)) break
  }
  await expect(trigger(page)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page).getByRole('button', { name: 'Fermer' })).toBeFocused()
})

test('locks the page scroll while open and restores it after', async ({ page }) => {
  await page.goto('/carte')
  const overflow = () => page.evaluate(() => getComputedStyle(document.documentElement).overflow)
  const before = await overflow()

  await trigger(page).click()
  await expect(dialog(page)).toBeVisible()
  expect(await overflow()).toBe('hidden')
  const top = await page.evaluate(() => window.scrollY)
  await page.mouse.wheel(0, 800)
  await page.waitForTimeout(200)
  expect(await page.evaluate(() => window.scrollY)).toBe(top)

  await page.keyboard.press('Escape')
  expect(await overflow()).toBe(before)
})

test('hides while the home reservation section is in view', async ({ page }) => {
  await page.goto('/')
  await expect(trigger(page)).toBeVisible()
  await page.locator('#reservation').scrollIntoViewIfNeeded()
  await expect(trigger(page)).toBeHidden()
  await page.locator('#hero').scrollIntoViewIfNeeded()
  await expect(trigger(page)).toBeVisible()
})

test('hides while the mobile menu is open', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/carte')
  await expect(trigger(page)).toBeVisible()
  await page.locator('.nav-toggle').click()
  await expect(trigger(page)).toBeHidden()
  await page.locator('.nav-toggle').click()
  await expect(trigger(page)).toBeVisible()
})

for (const viewport of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1280, height: 800 },
]) {
  test(`button and dialog fit the ${viewport.name} viewport`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/carte')

    const button = await trigger(page).boundingBox()
    expect(button).not.toBeNull()
    expect(button!.x).toBeGreaterThanOrEqual(0)
    expect(button!.y).toBeGreaterThanOrEqual(0)
    expect(button!.x + button!.width).toBeLessThanOrEqual(viewport.width)
    expect(button!.y + button!.height).toBeLessThanOrEqual(viewport.height)
    // Bottom-right corner.
    expect(button!.x + button!.width).toBeGreaterThan(viewport.width * 0.75)
    expect(button!.y).toBeGreaterThan(viewport.height * 0.75)

    await trigger(page).click()
    const box = await dialog(page).boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
    await expect(dialog(page).locator('iframe')).toBeInViewport()
    if (viewport.name === 'phone') expect(box!.width).toBeGreaterThanOrEqual(viewport.width - 1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
  })
}
