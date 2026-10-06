import { expect, test, type Page } from '@playwright/test'
import { ADMINS } from './credentials'

// Shared test database: the scenarios build on each other.
test.describe.configure({ mode: 'serial' })

async function login(page: Page, who: keyof typeof ADMINS) {
  await page.goto('/admin/login')
  await page.getByLabel('Email').fill(ADMINS[who].email)
  await page.getByLabel('Mot de passe').fill(ADMINS[who].password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/admin$/)
}

const adminItem = (page: Page, name: string) =>
  page.locator('li[data-item-id]').filter({ has: page.getByText(name, { exact: true }) })
const publicItem = (page: Page, name: string) =>
  page.locator('.menu-items li').filter({ has: page.locator('.menu-name', { hasText: name }) })

async function pizzaOrder(page: Page) {
  return page.locator('section[aria-labelledby="category-pizzas"] .admin-item-name').allTextContents()
}

test('Julien and Théo can both sign in, see the categories in order, and sign out', async ({ page }) => {
  for (const who of ['julien', 'theo'] as const) {
    await login(page, who)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('La carte')
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      'Antipasti', 'Pâtes & Plats', 'Pizzas', 'Desserts', 'Boissons', 'Réservations',
    ])
    await expect(page.getByText('Les réservations sont gérées via DISH Reservation.')).toBeVisible()
    await expect(page.locator('input[type="file"]')).toHaveCount(0)
    // Hidden and unavailable items are listed with their status.
    await expect(adminItem(page, 'Pizza Test Masquée')).toContainText('Masqué')
    await expect(adminItem(page, 'Pizza Test Indisponible')).toContainText('Indisponible')
    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    await expect(page).toHaveURL(/\/admin\/login$/)
  }
})

test('creates an item that appears immediately on /carte', async ({ page }) => {
  await login(page, 'julien')
  await page.getByRole('link', { name: 'Nouvel élément' }).click()
  await page.getByLabel('Catégorie').selectOption('desserts')
  await page.getByLabel('Nom').fill('Tiramisù della Nonna')
  await page.getByLabel('Description').fill('Mascarpone, café, cacao')
  await page.getByLabel('Prix (€)').fill('7,50')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await expect(adminItem(page, 'Tiramisù della Nonna')).toContainText('7,50€')

  await page.goto('/carte')
  const item = publicItem(page, 'Tiramisù della Nonna')
  await expect(item.locator('.menu-price')).toHaveText('7,50€')
  await expect(item.locator('.menu-desc')).toHaveText('Mascarpone, café, cacao')
})

test('rejects an invalid price, keeps what was typed and writes nothing', async ({ page }) => {
  await login(page, 'julien')
  await page.goto('/admin/menu/new')
  await page.getByLabel('Catégorie').selectOption('pizzas')
  await page.getByLabel('Nom').fill('Pizza au prix faux')
  await page.getByLabel('Prix (€)').fill('1e3')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('alert').first()).toContainText('Certains champs sont invalides')
  await expect(page.getByText(/Prix invalide/)).toBeVisible()
  await expect(page.getByLabel('Nom')).toHaveValue('Pizza au prix faux')
  await page.goto('/admin')
  await expect(adminItem(page, 'Pizza au prix faux')).toHaveCount(0)
})

test('edits name, price and description, reflected on /carte', async ({ page }) => {
  await login(page, 'theo')
  await adminItem(page, 'Tiramisù della Nonna').getByRole('link', { name: 'Modifier' }).click()
  await expect(page.getByLabel('Prix (€)')).toHaveValue('7,50')
  await page.getByLabel('Nom').fill('Tiramisù')
  await page.getByLabel('Prix (€)').fill('8')
  await page.getByLabel('Description').fill('Recette de Nonna')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(adminItem(page, 'Tiramisù')).toContainText('8€')

  await page.goto('/carte')
  await expect(publicItem(page, 'Tiramisù').locator('.menu-price')).toHaveText('8€')
  await expect(publicItem(page, 'Tiramisù').locator('.menu-desc')).toHaveText('Recette de Nonna')
  await expect(page.getByText('Tiramisù della Nonna')).toHaveCount(0)
})

test('hides and shows an item on the public menu', async ({ page }) => {
  await login(page, 'julien')
  await adminItem(page, 'Tiramisù').getByRole('button', { name: 'Masquer' }).click()
  await expect(adminItem(page, 'Tiramisù')).toContainText('Masqué')
  await page.goto('/carte')
  await expect(page.getByText('Tiramisù', { exact: true })).toHaveCount(0)

  await page.goto('/admin')
  await adminItem(page, 'Tiramisù').getByRole('button', { name: 'Afficher' }).click()
  await expect(adminItem(page, 'Tiramisù')).not.toContainText('Masqué')
  await page.goto('/carte')
  await expect(publicItem(page, 'Tiramisù')).toBeVisible()
})

test('marks an item unavailable and available again', async ({ page }) => {
  await login(page, 'julien')
  await adminItem(page, 'Tiramisù').getByRole('button', { name: 'Marquer indisponible' }).click()
  await expect(adminItem(page, 'Tiramisù').getByRole('button', { name: 'Marquer disponible' })).toBeVisible()
  await page.goto('/carte')
  await expect(publicItem(page, 'Tiramisù')).toHaveClass(/is-unavailable/)
  await expect(publicItem(page, 'Tiramisù')).toContainText('Indisponible')

  await page.goto('/admin')
  await adminItem(page, 'Tiramisù').getByRole('button', { name: 'Marquer disponible' }).click()
  await expect(adminItem(page, 'Tiramisù').getByRole('button', { name: 'Marquer indisponible' })).toBeVisible()
  await page.goto('/carte')
  await expect(publicItem(page, 'Tiramisù')).not.toHaveClass(/is-unavailable/)
})

test('reorders items within a category, reflected on /carte', async ({ page }) => {
  await login(page, 'julien')
  const before = await pizzaOrder(page)
  const [first, second] = [before.indexOf('Pizza Test 1'), before.indexOf('Pizza Test 2')]
  expect(second).toBe(first + 1)
  const swapped = [...before]
  ;[swapped[first], swapped[second]] = [swapped[second], swapped[first]]

  await adminItem(page, 'Pizza Test 2').getByRole('button', { name: 'Monter' }).click()
  await expect.poll(() => pizzaOrder(page)).toEqual(swapped)
  await expect(adminItem(page, 'Pizza Test 2')).toContainText(`Position ${first + 1}`)

  await page.goto('/carte')
  const publicPizzas = page.locator('.menu-category').filter({ has: page.getByRole('heading', { name: 'Pizzas' }) })
  const names = await publicPizzas.locator('.menu-name').allTextContents()
  expect(names.indexOf('Pizza Test 2')).toBeLessThan(names.indexOf('Pizza Test 1'))

  await page.goto('/admin')
  await adminItem(page, 'Pizza Test 2').getByRole('button', { name: 'Descendre' }).click()
  await expect.poll(() => pizzaOrder(page)).toEqual(before)
  // The first item of a category cannot move up.
  await expect(adminItem(page, before[0]).getByRole('button', { name: 'Monter' })).toBeDisabled()
})

test('deletes an item only after confirmation', async ({ page }) => {
  await login(page, 'theo')
  await adminItem(page, 'Tiramisù').getByRole('link', { name: 'Supprimer' }).click()
  await expect(page).toHaveURL(/\/admin\/menu\/\d+#supprimer$/)
  const remove = page.getByRole('button', { name: 'Supprimer définitivement' })
  // The browser blocks the submission without the confirmation box.
  await remove.click()
  await expect(page).toHaveURL(/\/admin\/menu\/\d+/)
  await page.getByLabel('Je confirme la suppression').check()
  await remove.click()
  await expect(page).toHaveURL(/\/admin$/)
  await expect(adminItem(page, 'Tiramisù')).toHaveCount(0)
  await page.goto('/carte')
  await expect(page.getByText('Tiramisù', { exact: true })).toHaveCount(0)
})

test('an unknown item returns a 404', async ({ page }) => {
  await login(page, 'julien')
  expect((await page.goto('/admin/menu/999999'))?.status()).toBe(404)
  expect((await page.goto('/admin/menu/abc'))?.status()).toBe(404)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

  test('login, list and quick toggles are usable without horizontal scrolling', async ({ page }) => {
    await login(page, 'julien')
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
    const item = adminItem(page, 'Boisson Test 1')
    await item.getByRole('button', { name: 'Marquer indisponible' }).tap()
    await expect(item.getByRole('button', { name: 'Marquer disponible' })).toBeVisible()
    await item.getByRole('button', { name: 'Marquer disponible' }).tap()
    await expect(item.getByRole('button', { name: 'Marquer indisponible' })).toBeVisible()
    const box = await item.getByRole('button', { name: 'Masquer' }).boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)

    await page.goto('/admin/menu/new')
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
  })
})
