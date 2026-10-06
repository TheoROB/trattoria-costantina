import { expect, test } from '@playwright/test'

test('navbar switches to its scrolled style after 40px', async ({ page }) => {
  await page.goto('/')
  const nav = page.locator('#navbar')
  await expect(nav).not.toHaveClass(/scrolled/)
  await page.mouse.wheel(0, 600)
  await expect(nav).toHaveClass(/scrolled/)
})

test('mobile menu toggles and closes on link click', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  const toggle = page.locator('.nav-toggle')
  const links = page.locator('.nav-links')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(links).toHaveClass(/open/)
  await links.getByRole('link', { name: 'La Carte' }).click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(links).not.toHaveClass(/open/)
})

test('all mockup sections render in order', async ({ page }) => {
  await page.goto('/')
  const ids = await page.locator('body > section, body > nav, body > footer').evaluateAll((els) =>
    els.map((e) => e.id || e.className),
  )
  expect(ids).toEqual([
    'navbar',
    'hero',
    'histoire',
    'specialites',
    'reservation',
    'section-famille',
    'trouver',
    'footer',
  ])
})
