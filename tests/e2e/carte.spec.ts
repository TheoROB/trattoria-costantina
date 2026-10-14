import { expect, test, type Page } from '@playwright/test'
import { DB_DOWN_PORT } from '../../playwright.config'

test.describe('home page menu preview', () => {
  test('shows pizzas plus two other categories, at most four items each', async ({ page }) => {
    await page.goto('/')
    const section = page.locator('#specialites')
    await expect(section.locator('.menu-category h3')).toHaveText(['Antipasti', 'Pasta', 'Pizza Napoletana'])
    const pizzas = section.locator('.menu-category').filter({ hasText: 'Pizza Napoletana' })
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

// Categories holding visible items in the test data, in menu order.
const CATEGORIES = ['Antipasti', 'Pasta', 'Pizza Napoletana', 'Desserts', 'Spritz', 'Vins', 'Sans alcool', 'Boissons']

const bar = (page: Page) => page.getByRole('navigation', { name: 'Catégories de la carte' })

// Only this category is displayed, and its chip is marked as the current one.
async function expectShown(page: Page, key: string, label: string) {
  await expect(page.locator('.carte-section:visible')).toHaveCount(1)
  await expect(page.locator(`#carte-${key}`)).toBeVisible()
  await expect(bar(page).locator('[aria-current="true"]')).toHaveText(label)
}

test.describe('/carte', () => {
  test('lists every visible item of every category in order, server-rendered', async ({ request, page }) => {
    const html = await (await request.get('/carte')).text()
    expect(html).toContain('Pizza Test 5')
    expect(html).not.toContain('Pizza Test Masquée')

    await page.goto('/carte')
    await expect(page.locator('h1')).toHaveText('La Carte')
    // Empty categories are not shown; items still in the retired "Boissons" category come last.
    await expect(page.locator('.menu-category h2')).toHaveText(CATEGORIES)
    const pizzas = page.locator('.menu-category').filter({ hasText: 'Pizza Napoletana' }).locator('.menu-name')
    await expect(pizzas).toHaveText([
      /^Pizza Test Indisponible/,
      'Pizza Test 1',
      'Pizza Test 2',
      'Pizza Test 3',
      'Pizza Test 4',
      'Pizza Test 5',
    ])
  })

  test('shows one category at a time, the first one by default, the others staying in the page', async ({ page }) => {
    await page.goto('/carte')
    await expect(bar(page).getByRole('link')).toHaveText(CATEGORIES)
    await expectShown(page, 'antipasti', 'Antipasti')
    // Every category is in the page (search engines, screen readers), only one is displayed.
    await expect(page.locator('.carte-section')).toHaveCount(CATEGORIES.length)
    await expect(page.locator('.carte-section:visible')).toHaveCount(1)
    // Empty categories have neither a chip nor a section.
    await expect(page.locator('#carte-aperitifs, #carte-digestifs')).toHaveCount(0)
  })

  test('a chip shows its category without reloading and puts it in the URL; back and forward follow', async ({ page }) => {
    await page.goto('/carte')
    await page.evaluate(() => Object.assign(window, { sameDocument: true }))
    await bar(page).getByRole('link', { name: 'Pizza Napoletana' }).click()
    await expect(page).toHaveURL(/\/carte#pizzas$/)
    await expectShown(page, 'pizzas', 'Pizza Napoletana')
    await bar(page).getByRole('link', { name: 'Vins' }).click()
    await expect(page).toHaveURL(/\/carte#vins$/)
    await expectShown(page, 'vins', 'Vins')

    await page.goBack()
    await expect(page).toHaveURL(/\/carte#pizzas$/)
    await expectShown(page, 'pizzas', 'Pizza Napoletana')
    await page.goBack()
    await expect(page).toHaveURL(/\/carte$/)
    await expectShown(page, 'antipasti', 'Antipasti')
    await page.goForward()
    await expectShown(page, 'pizzas', 'Pizza Napoletana')
    expect(await page.evaluate(() => (window as unknown as { sameDocument?: boolean }).sameDocument)).toBe(true)
  })

  test('opens the category named in the URL; an unknown or empty one falls back to the first', async ({ page }) => {
    await page.goto('/carte#vins')
    await expectShown(page, 'vins', 'Vins')
    for (const hash of ['#nope', '#digestifs']) {
      await page.goto('about:blank')
      await page.goto(`/carte${hash}`)
      await expectShown(page, 'antipasti', 'Antipasti')
    }
  })

  test('works with the keyboard', async ({ page }) => {
    await page.goto('/carte')
    await bar(page).getByRole('link', { name: 'Desserts' }).focus()
    await page.keyboard.press('Enter')
    await expectShown(page, 'desserts', 'Desserts')
    await page.getByRole('link', { name: /Catégorie suivante : Spritz/ }).focus()
    await page.keyboard.press('Enter')
    await expectShown(page, 'spritz', 'Spritz')
    await page.getByRole('button', { name: 'Voir toute la carte' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.carte-section:visible')).toHaveCount(CATEGORIES.length)
  })

  test('"next category" leads through the menu; "see the whole menu" shows everything, a chip goes back to one', async ({ page }) => {
    await page.goto('/carte#vins')
    await page.getByRole('link', { name: /Catégorie suivante : Sans alcool/ }).click()
    await expect(page).toHaveURL(/#sans_alcool$/)
    await expectShown(page, 'sans_alcool', 'Sans alcool')
    await page.getByRole('link', { name: /Catégorie suivante : Boissons/ }).click()
    await expect(page).toHaveURL(/#boissons$/)
    await expectShown(page, 'boissons', 'Boissons')
    // Last category: nothing next.
    await expect(page.getByRole('link', { name: /Catégorie suivante/ })).toHaveCount(0)

    await page.getByRole('button', { name: 'Voir toute la carte' }).click()
    await expect(page.locator('.carte-section:visible')).toHaveCount(CATEGORIES.length)
    await expect(bar(page).locator('[aria-current]')).toHaveCount(0)
    await bar(page).getByRole('link', { name: 'Pasta' }).click()
    await expectShown(page, 'pates_plats', 'Pasta')
    await page.getByRole('button', { name: 'Voir toute la carte' }).click()
    await page.getByRole('button', { name: 'Afficher une catégorie à la fois' }).click()
    await expectShown(page, 'pates_plats', 'Pasta')
  })

  test('after scrolling down a category, the next one starts at the top of the menu, under the sticky bar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 640 })
    await page.goto('/carte#pizzas')
    await page.getByRole('link', { name: /Catégorie suivante/ }).scrollIntoViewIfNeeded()
    await page.getByRole('link', { name: /Catégorie suivante : Desserts/ }).click()
    await expectShown(page, 'desserts', 'Desserts')
    const [stuck, title] = [await bar(page).boundingBox(), await page.locator('#carte-desserts-title').boundingBox()]
    expect(Math.round(stuck!.y)).toBe(76)
    expect(title!.y).toBeGreaterThanOrEqual(stuck!.y + stuck!.height)
    expect(title!.y).toBeLessThan(stuck!.y + stuck!.height + 60)
  })

  for (const [device, width, dishColumns, drinkColumns] of [['phone', 375, 1, 1], ['tablet', 800, 2, 2], ['desktop', 1280, 3, 2]] as const) {
    test(`${device}: compact dishes in ${dishColumns} column(s), drinks as a list, nothing wider than the screen`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      const columns = (selector: string) => page.locator(selector).evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
      await page.goto('/carte#pizzas')
      await expectShown(page, 'pizzas', 'Pizza Napoletana')
      expect(await columns('#carte-pizzas .carte-dishes')).toBe(dishColumns)
      await expect(page.locator('#carte-pizzas .carte-dish')).toHaveCount(6)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
      await page.goto('/carte#vins')
      await expectShown(page, 'vins', 'Vins')
      expect(await columns('#carte-vins .carte-drinks')).toBe(drinkColumns)
      await expect(page.locator('#carte-vins .carte-drink')).toHaveText([/^Vin Test 1.*24€$/])
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
      if (device === 'desktop') {
        // Every chip on a single row.
        const tops = await bar(page).getByRole('link').evaluateAll((els) => new Set(els.map((el) => el.getBoundingClientRect().top)).size)
        expect(tops).toBe(1)
      }
    })
  }

  test('on a phone the category bar scrolls sideways and brings the current chip into view', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/carte#boissons')
    const list = bar(page).getByRole('list')
    expect(await list.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
    await expectShown(page, 'boissons', 'Boissons')
    await expect.poll(async () => {
      const box = await bar(page).getByRole('link', { name: 'Boissons' }).boundingBox()
      return box!.x >= 0 && box!.x + box!.width <= 375
    }).toBe(true)
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
