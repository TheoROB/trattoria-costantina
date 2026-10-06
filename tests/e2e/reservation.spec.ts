import { expect, test, type Page } from '@playwright/test'

const widgetPath =
  '/widget/hydra-0ab49cf0-0e40-11f0-b2b0-112fd36a4b37'

async function expectResponsiveWidget(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport)
  await page.goto('/')

  const card = page.locator('.reservation-form-card')
  const iframe = card.locator('iframe')
  await iframe.scrollIntoViewIfNeeded()
  await expect(iframe).toBeVisible()

  const [cardBox, iframeBox, scrollWidth] = await Promise.all([
    card.boundingBox(),
    iframe.boundingBox(),
    page.evaluate(() => document.documentElement.scrollWidth),
  ])

  expect(cardBox).not.toBeNull()
  expect(iframeBox).not.toBeNull()
  expect(iframeBox!.width).toBeLessThanOrEqual(cardBox!.width)
  expect(iframeBox!.x).toBeGreaterThanOrEqual(cardBox!.x)
  expect(iframeBox!.x + iframeBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1)
  expect(scrollWidth).toBeLessThanOrEqual(viewport.width)

  const iframeHandle = await iframe.elementHandle()
  const dishFrame = await iframeHandle!.contentFrame()
  expect(dishFrame).not.toBeNull()
  await dishFrame!.waitForURL((url) => url.href.startsWith('https://reservation.dish.co/widget/'))
  await dishFrame!.waitForLoadState('networkidle')
  const widgetHeight = await dishFrame!.evaluate(() => ({
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }))
  expect(widgetHeight.scrollHeight).toBeLessThanOrEqual(widgetHeight.clientHeight)
}

test('replaces the mock reservation form with the DISH iframe', async ({ page }) => {
  await page.goto('/')

  const card = page.locator('.reservation-form-card')
  await expect(card.locator('form')).toHaveCount(0)
  await expect(page.getByText('Demande envoyée !')).toHaveCount(0)
  await expect(page.getByText(/Réservation gratuite/)).toHaveCount(0)

  const iframe = card.locator('iframe')
  await expect(iframe).toHaveAttribute('title', 'Réservation en ligne DISH')
  await expect(iframe).toHaveAttribute('loading', 'lazy')
  const src = await iframe.getAttribute('src')
  expect(src).not.toBeNull()
  const url = new URL(src!)
  expect(url.origin).toBe('https://reservation.dish.co')
  expect(url.pathname).toBe(widgetPath)
})

test('keeps the reservation phone fallback visible', async ({ page }) => {
  await page.goto('/')

  const fallback = page
    .locator('.reservation-form-card')
    .getByRole('link', { name: '09 78 81 32 95' })
  await expect(fallback).toBeVisible()
  await expect(fallback).toHaveAttribute('href', 'tel:+33978813295')
})

test('loads the widget under the enforced CSP without violations or console errors', async ({ page }) => {
  const consoleErrors: string[] = []
  const cspViolations: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await page.exposeFunction('recordCspViolation', (value: string) => cspViolations.push(value))
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      void window.recordCspViolation(`${event.violatedDirective}: ${event.blockedURI}`)
    })
  })

  const response = await page.goto('/')
  expect(response?.headers()['content-security-policy']).toBeTruthy()
  await page.locator('.reservation-form-card iframe').scrollIntoViewIfNeeded()
  await page.waitForLoadState('networkidle')

  expect(cspViolations).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('fits inside its card on mobile', async ({ page }) => {
  await expectResponsiveWidget(page, { width: 375, height: 812 })
})

test('fits inside its card on desktop', async ({ page }) => {
  await expectResponsiveWidget(page, { width: 1280, height: 800 })
})

declare global {
  interface Window {
    recordCspViolation: (value: string) => Promise<void>
  }
}
