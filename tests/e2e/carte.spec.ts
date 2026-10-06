import { expect, test } from '@playwright/test'
import { DB_DOWN_PORT } from '../../playwright.config'

test.describe('home page menu preview', () => {
  test('shows pizzas plus two other categories, at most four items each', async ({ page }) => {
    await page.goto('/')
    const section = page.locator('#specialites')
    await expect(section.locator('.menu-category h3')).toHaveText(['Antipasti', 'Pâtes & Plats', 'Pizzas'])
    const pizzas = section.locator('.menu-category').filter({ hasText: 'Pizzas' })
    await expect(pizzas.locator('.menu-name')).toHaveCount(4)
  })

  test('never renders hidden items and flags unavailable ones', async ({ page }) => {
    await page.goto('/')
    const section = page.locator('#specialites')
    await expect(section).not.toContainText('Pizza Test Masquée')
    const soldOut = section.locator('li').filter({ hasText: 'Pizza Test Indisponible' })
    await expect(soldOut).toContainText('Indisponible')
    await expect(soldOut).toHaveClass(/is-unavailable/)
  })

  test('no longer shows the placeholder food photos and links to the full menu', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.food-grid')).toHaveCount(0)
    await expect(page.locator('#specialites a', { hasText: 'Voir la carte complète' })).toHaveAttribute('href', '/carte')
  })

  test('formats prices like the mockup', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#specialites li', { hasText: 'Pizza Test 2' }).locator('.menu-price')).toHaveText('12,50€')
  })
})

test.describe('/carte', () => {
  test('lists every visible item of every category in order, server-rendered', async ({ request, page }) => {
    const html = await (await request.get('/carte')).text()
    expect(html).toContain('Pizza Test 5')
    expect(html).not.toContain('Pizza Test Masquée')

    await page.goto('/carte')
    await expect(page.locator('h1')).toHaveText('La Carte')
    await expect(page.locator('.menu-category h2')).toHaveText(['Antipasti', 'Pâtes & Plats', 'Pizzas', 'Desserts', 'Boissons'])
    const pizzas = page.locator('.menu-category').filter({ hasText: 'Pizzas' }).locator('.menu-name')
    await expect(pizzas).toHaveText([
      /^Pizza Test Indisponible/,
      'Pizza Test 1',
      'Pizza Test 2',
      'Pizza Test 3',
      'Pizza Test 4',
      'Pizza Test 5',
    ])
  })

  test('has its own title and keeps the site navigation', async ({ page }) => {
    await page.goto('/carte')
    await expect(page).toHaveTitle(/La carte/)
    await expect(page.locator('#navbar')).toBeVisible()
    await expect(page.locator('footer.footer')).toBeVisible()
  })

  test('loads with the CSP enforced and no console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/carte', { waitUntil: 'networkidle' })
    expect(errors).toEqual([])
  })
})

test.describe('when MySQL is unreachable', () => {
  test.use({ baseURL: `http://localhost:${DB_DOWN_PORT}` })

  for (const path of ['/', '/carte']) {
    test(`${path} still renders with a clear message`, async ({ page }) => {
      const res = await page.goto(path)
      expect(res?.status()).toBe(200)
      await expect(page.locator('.menu-status')).toHaveText(/momentanément indisponible/)
      await expect(page.locator('.menu-name')).toHaveCount(0)
    })
  }
})
