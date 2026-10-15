import { expect, test, type Page } from '@playwright/test'
import { execute, insertMenuItem, menuItem } from '../../security/helpers/db'
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

const tabs = (page: Page) => page.getByRole('navigation', { name: 'Sections de la carte' })
const shownCategories = (page: Page) => page.locator('section.admin-category h2').allTextContents()
const order = (page: Page, key: string) => page.locator(`section[aria-labelledby="category-${key}"] .admin-item-name`).allTextContents()
const drawer = (page: Page) => page.getByRole('dialog')

test('Julien and Théo can both sign in, see the categories with their counts, one at a time, and sign out', async ({ page }) => {
  for (const who of ['julien', 'theo'] as const) {
    await login(page, who)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('La carte')
    await expect(tabs(page).getByRole('link')).toHaveText([
      'Antipasti · 2', 'Pasta · 1', 'Pizza Napoletana · 7', 'Desserts · 1', 'Spritz · 1', 'Apéritifs · 0',
      'Bières pression · 0', 'Bières bouteille · 0', 'Vins · 1', 'Digestifs · 0', 'Sans alcool · 1',
    ])
    // First category with items, alone.
    expect(await shownCategories(page)).toEqual(['Antipasti'])
    await expect(tabs(page).getByRole('link', { name: /^Antipasti/ })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('li[data-item-id]')).toHaveCount(2)
    await expect(page.getByText('Les réservations sont gérées via DISH Reservation.')).toBeVisible()
    await expect(page.locator('input[type="file"]')).toHaveCount(0)

    await tabs(page).getByRole('link', { name: /^Pizza Napoletana/ }).click()
    await expect(page).toHaveURL(/\/admin\?categorie=pizzas$/)
    expect(await shownCategories(page)).toEqual(['Pizza Napoletana'])
    await expect(page.locator('li[data-item-id]')).toHaveCount(7)
    await expect(adminItem(page, 'Antipasto Test 1')).toHaveCount(0)
    // Hidden and unavailable items are listed with their status.
    await expect(adminItem(page, 'Pizza Test Masquée')).toContainText('Masqué')
    await expect(adminItem(page, 'Pizza Test Indisponible')).toContainText('Indisponible')
    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    await expect(page).toHaveURL(/\/admin\/login$/)
  }
})

test('an unknown category in the address falls back to the first one with items', async ({ page }) => {
  await login(page, 'julien')
  await page.goto('/admin?categorie=sushis')
  expect(await shownCategories(page)).toEqual(['Antipasti'])
  await page.goto('/admin?categorie=aperitifs')
  expect(await shownCategories(page)).toEqual(['Apéritifs'])
  await expect(page.getByText('Aucun élément dans cette catégorie.')).toBeVisible()
})

test('adds an item to the category being viewed, in a side panel, and it appears on /carte', async ({ page }) => {
  await login(page, 'julien')
  await tabs(page).getByRole('link', { name: /^Desserts/ }).click()
  await expect(page).toHaveURL(/\/admin\?categorie=desserts$/)
  await page.getByRole('link', { name: 'Ajouter un élément' }).click()
  await expect(page).toHaveURL(/\/admin\/menu\/new\?categorie=desserts$/)
  await expect(drawer(page)).toBeVisible()
  await expect(drawer(page).getByRole('heading', { name: 'Nouvel élément' })).toBeVisible()
  await expect(page.getByLabel('Catégorie')).toHaveValue('desserts')
  await page.getByLabel('Nom').fill('Tiramisù della Nonna')
  await page.getByLabel('Description').fill('Mascarpone, café, cacao')
  await page.getByLabel('Prix (€)').fill('7,50')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page).toHaveURL(/\/admin\?categorie=desserts$/)
  await expect(drawer(page)).toHaveCount(0)
  await expect(adminItem(page, 'Tiramisù della Nonna')).toContainText('7,50€')
  await expect(tabs(page).getByRole('link', { name: /^Desserts/ })).toHaveText('Desserts · 2')

  await page.goto('/carte')
  const item = publicItem(page, 'Tiramisù della Nonna')
  await expect(item.locator('.menu-price')).toHaveText('7,50€')
  await expect(item.locator('.menu-desc')).toHaveText('Mascarpone, café, cacao')
})

test('the side panel closes with Escape or "Fermer" and goes back to the category', async ({ page }) => {
  await login(page, 'julien')
  await page.goto('/admin/menu/new?categorie=vins')
  await expect(drawer(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/admin\?categorie=vins$/)
  await expect(drawer(page)).toHaveCount(0)
  await adminItem(page, 'Vin Test 1').getByRole('link', { name: 'Modifier' }).click()
  await expect(drawer(page).getByRole('heading', { name: 'Modifier « Vin Test 1 »' })).toBeVisible()
  await drawer(page).getByRole('link', { name: 'Fermer' }).click()
  await expect(page).toHaveURL(/\/admin\?categorie=vins$/)
  await expect(drawer(page)).toHaveCount(0)
})

test('rejects an invalid price, keeps what was typed and writes nothing', async ({ page }) => {
  await login(page, 'julien')
  await page.goto('/admin/menu/new?categorie=pizzas')
  await page.getByLabel('Nom').fill('Pizza au prix faux')
  await page.getByLabel('Prix (€)').fill('1e3')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('alert').first()).toContainText('Certains champs sont invalides')
  await expect(page.getByText(/Prix invalide/)).toBeVisible()
  await expect(page.getByLabel('Nom')).toHaveValue('Pizza au prix faux')
  await page.goto('/admin?categorie=pizzas')
  await expect(adminItem(page, 'Pizza au prix faux')).toHaveCount(0)
})

test('edits name, price and description in the side panel, reflected on /carte', async ({ page }) => {
  await login(page, 'theo')
  await page.goto('/admin?categorie=desserts')
  await adminItem(page, 'Tiramisù della Nonna').getByRole('link', { name: 'Modifier' }).click()
  await expect(page).toHaveURL(/\/admin\/menu\/\d+$/)
  await expect(page.getByLabel('Prix (€)')).toHaveValue('7,50')
  await page.getByLabel('Nom').fill('Tiramisù')
  await page.getByLabel('Prix (€)').fill('8')
  await page.getByLabel('Description').fill('Recette de Nonna')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page).toHaveURL(/\/admin\?categorie=desserts$/)
  await expect(adminItem(page, 'Tiramisù')).toContainText('8€')

  await page.goto('/carte')
  await expect(publicItem(page, 'Tiramisù').locator('.menu-price')).toHaveText('8€')
  await expect(publicItem(page, 'Tiramisù').locator('.menu-desc')).toHaveText('Recette de Nonna')
  await expect(page.getByText('Tiramisù della Nonna')).toHaveCount(0)
})

test('hides and shows an item straight from its row, with immediate feedback', async ({ page }) => {
  await login(page, 'julien')
  await page.goto('/admin?categorie=desserts')
  const save = page.waitForResponse((r) => r.request().method() === 'POST' && Boolean(r.request().headers()['next-action']))
  await adminItem(page, 'Tiramisù').getByRole('button', { name: 'Masquer' }).click()
  await expect(adminItem(page, 'Tiramisù').getByRole('button', { name: 'Afficher' })).toHaveText('Masqué')
  await save
  await expect(page.getByText('« Tiramisù » : masqué.')).toBeVisible()
  await page.reload()
  await expect(adminItem(page, 'Tiramisù')).toContainText('Masqué')
  await page.goto('/carte')
  await expect(page.getByText('Tiramisù', { exact: true })).toHaveCount(0)

  await page.goto('/admin?categorie=desserts')
  await adminItem(page, 'Tiramisù').getByRole('button', { name: 'Afficher' }).click()
  await expect(page.getByText('« Tiramisù » : visible.')).toBeVisible()
  await page.reload()
  await expect(adminItem(page, 'Tiramisù')).not.toContainText('Masqué')
  await page.goto('/carte#desserts')
  await expect(publicItem(page, 'Tiramisù')).toBeVisible()
})

test('marks an item unavailable and available again straight from its row', async ({ page }) => {
  await login(page, 'julien')
  await page.goto('/admin?categorie=desserts')
  await adminItem(page, 'Tiramisù').getByRole('button', { name: 'Marquer indisponible' }).click()
  await expect(adminItem(page, 'Tiramisù').getByRole('button', { name: 'Marquer disponible' })).toHaveText('Indisponible')
  await expect(page.getByText('« Tiramisù » : indisponible.')).toBeVisible()
  await page.goto('/carte')
  await expect(publicItem(page, 'Tiramisù')).toHaveClass(/is-unavailable/)
  await expect(publicItem(page, 'Tiramisù')).toContainText('Indisponible')

  await page.goto('/admin?categorie=desserts')
  await adminItem(page, 'Tiramisù').getByRole('button', { name: 'Marquer disponible' }).click()
  await expect(page.getByText('« Tiramisù » : disponible.')).toBeVisible()
  await page.goto('/carte')
  await expect(publicItem(page, 'Tiramisù')).not.toHaveClass(/is-unavailable/)
})

test('reorders items with Monter / Descendre, from the keyboard too, reflected on /carte', async ({ page }) => {
  await login(page, 'julien')
  await page.goto('/admin?categorie=pizzas')
  const before = await order(page, 'pizzas')
  const [first, second] = [before.indexOf('Pizza Test 1'), before.indexOf('Pizza Test 2')]
  expect(second).toBe(first + 1)
  const swapped = [...before]
  ;[swapped[first], swapped[second]] = [swapped[second], swapped[first]]

  await adminItem(page, 'Pizza Test 2').getByRole('button', { name: 'Monter' }).click()
  await expect.poll(() => order(page, 'pizzas')).toEqual(swapped)
  await expect(page.getByText(`« Pizza Test 2 » est maintenant en position ${first + 1}.`)).toBeVisible()

  await page.goto('/carte#pizzas')
  const names = await page.locator('#carte-pizzas .menu-name').allTextContents()
  expect(names.indexOf('Pizza Test 2')).toBeLessThan(names.indexOf('Pizza Test 1'))

  // Keyboard: the focus stays on the button used, so it can be pressed again.
  await page.goto('/admin?categorie=pizzas')
  const down = adminItem(page, 'Pizza Test 2').getByRole('button', { name: 'Descendre' })
  await down.focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => order(page, 'pizzas')).toEqual(before)
  await expect(down).toBeFocused()
  await expect(page.getByText(`« Pizza Test 2 » est maintenant en position ${second + 1}.`)).toBeVisible()
  await page.reload()
  expect(await order(page, 'pizzas')).toEqual(before)
  // The first item of a category cannot move up.
  await expect(adminItem(page, before[0]).getByRole('button', { name: 'Monter' })).toBeDisabled()
})

test('reorders items by dragging the handle, saved in one move', async ({ page }) => {
  await login(page, 'julien')
  await page.goto('/admin?categorie=pizzas')
  const before = await order(page, 'pizzas')
  const from = before.indexOf('Pizza Test 4')
  const to = before.indexOf('Pizza Test 1')
  const expected = [...before]
  expected.splice(to, 0, ...expected.splice(from, 1))

  const save = page.waitForResponse((r) => r.request().method() === 'POST' && Boolean(r.request().headers()['next-action']))
  await adminItem(page, 'Pizza Test 4').locator('.admin-row-handle').dragTo(adminItem(page, 'Pizza Test 1'))
  await save
  await expect.poll(() => order(page, 'pizzas')).toEqual(expected)
  await page.reload()
  expect(await order(page, 'pizzas')).toEqual(expected)

  // Back to the original order: dropped on the row now at its former place.
  await adminItem(page, 'Pizza Test 4').locator('.admin-row-handle').dragTo(adminItem(page, expected[from]))
  await expect.poll(async () => {
    await page.reload()
    return order(page, 'pizzas')
  }).toEqual(before)
})

test('deletes an item only after confirmation, from its row', async ({ page }) => {
  await login(page, 'theo')
  await page.goto('/admin?categorie=desserts')
  await adminItem(page, 'Tiramisù').getByRole('link', { name: 'Supprimer' }).click()
  await expect(page).toHaveURL(/\/admin\/menu\/\d+#supprimer$/)
  // The panel opens on the deletion, the confirmation box has the focus.
  await expect(page.getByLabel('Je confirme la suppression')).toBeFocused()
  const remove = page.getByRole('button', { name: 'Supprimer définitivement' })
  // The browser blocks the submission without the confirmation box.
  await remove.click()
  await expect(page).toHaveURL(/\/admin\/menu\/\d+/)
  await page.getByLabel('Je confirme la suppression').check()
  await remove.click()
  await expect(page).toHaveURL(/\/admin\?categorie=desserts$/)
  await expect(adminItem(page, 'Tiramisù')).toHaveCount(0)
  await page.goto('/carte')
  await expect(page.getByText('Tiramisù', { exact: true })).toHaveCount(0)
})

test('a network failure during a quick change rolls it back and keeps the admin usable', async ({ page }) => {
  const violations: string[] = []
  page.on('console', (m) => m.type() === 'error' && /Content Security Policy/.test(m.text()) && violations.push(m.text()))
  await login(page, 'julien')
  await page.goto('/admin?categorie=sans_alcool')
  const isAction = (url: URL) => url.pathname === '/admin'
  await page.route(isAction, (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()))
  await adminItem(page, 'Soda Test 1').getByRole('button', { name: 'Masquer' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'La modification n’a pas pu être enregistrée' })).toBeVisible()
  // Back to its real state.
  await expect(adminItem(page, 'Soda Test 1').getByRole('button', { name: 'Masquer' })).toHaveText('Visible')
  await page.unroute(isAction)
  await adminItem(page, 'Soda Test 1').getByRole('button', { name: 'Masquer' }).click()
  await expect(page.getByText('« Soda Test 1 » : masqué.')).toBeVisible()
  await adminItem(page, 'Soda Test 1').getByRole('button', { name: 'Afficher' }).click()
  await expect(page.getByText('« Soda Test 1 » : visible.')).toBeVisible()
  expect(violations).toEqual([])
})

test.describe('a quick change being saved', () => {
  const isAction = (url: URL) => url.pathname === '/admin'
  const saving = (page: Page) => page.getByText('Enregistrement en cours…')
  let item: { id: number; name: string }

  test.beforeEach(async () => {
    item = await insertMenuItem({ category_key: 'desserts', name: 'Panna Cotta Test', price_cents: 700, position: 99 })
  })
  test.afterEach(async () => {
    await execute('DELETE FROM menu_items WHERE id = ?', [item.id])
  })

  // Holds the first quick-change request until released, to act while it is being saved.
  async function holdSave(page: Page) {
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    let held = false
    await page.route(isAction, async (route) => {
      if (route.request().method() !== 'POST' || held) return route.continue()
      held = true
      await released
      await route.continue()
    })
    return release
  }

  test('switching category right after a toggle waits for the save, then goes', async ({ page }) => {
    await login(page, 'julien')
    await page.goto('/admin?categorie=desserts')
    const release = await holdSave(page)
    await adminItem(page, item.name).getByRole('button', { name: 'Masquer' }).click()
    await tabs(page).getByRole('link', { name: /^Antipasti/ }).click()
    // Pending: marked on the button and announced, no success yet, still on the category.
    await expect(adminItem(page, item.name).getByRole('button', { name: 'Afficher' })).toHaveAttribute('aria-busy', 'true')
    await expect(saving(page)).toBeVisible()
    await expect(page.getByText(`« ${item.name} » : masqué.`)).toHaveCount(0)
    await expect(page).toHaveURL(/categorie=desserts$/)
    release()
    await expect(page).toHaveURL(/categorie=antipasti$/)
    expect((await menuItem(item.id))?.is_visible).toBe(0)
    await tabs(page).getByRole('link', { name: /^Desserts/ }).click()
    await expect(adminItem(page, item.name).getByRole('button', { name: 'Afficher' })).toHaveText('Masqué')
  })

  test('opening Modifier right after a toggle waits for the save, then opens the panel', async ({ page }) => {
    await login(page, 'julien')
    await page.goto('/admin?categorie=desserts')
    const release = await holdSave(page)
    await adminItem(page, item.name).getByRole('button', { name: 'Marquer indisponible' }).click()
    await adminItem(page, item.name).getByRole('link', { name: 'Modifier' }).click()
    await expect(saving(page)).toBeVisible()
    await expect(drawer(page)).toHaveCount(0)
    release()
    await expect(page).toHaveURL(new RegExp(`/admin/menu/${item.id}$`))
    await expect(drawer(page)).toBeVisible()
    await expect(drawer(page).getByLabel('Disponible', { exact: true })).not.toBeChecked()
    expect((await menuItem(item.id))?.is_available).toBe(0)
  })

  test('a double click saves the toggle once', async ({ page }) => {
    await login(page, 'julien')
    await page.goto('/admin?categorie=desserts')
    let posts = 0
    page.on('request', (r) => r.method() === 'POST' && r.headers()['next-action'] && posts++)
    await adminItem(page, item.name).getByRole('button', { name: 'Masquer' }).dblclick()
    await expect(page.getByText(`« ${item.name} » : masqué.`)).toBeVisible()
    await expect(adminItem(page, item.name).getByRole('button', { name: 'Afficher' })).toHaveText('Masqué')
    expect(posts).toBe(1)
    expect((await menuItem(item.id))?.is_visible).toBe(0)
  })

  test('a failed save cancels the navigation asked for meanwhile and rolls back', async ({ page }) => {
    await login(page, 'julien')
    await page.goto('/admin?categorie=desserts')
    // The save fails only once the navigation has been asked for (an immediate abort could finish before the click).
    let fail!: () => void
    const failing = new Promise<void>((resolve) => (fail = resolve))
    await page.route(isAction, async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      await failing
      await route.abort()
    })
    await adminItem(page, item.name).getByRole('button', { name: 'Masquer' }).click()
    await tabs(page).getByRole('link', { name: /^Antipasti/ }).click()
    await expect(saving(page)).toBeVisible()
    fail()
    await expect(page.getByRole('alert').filter({ hasText: 'La modification n’a pas pu être enregistrée' })).toBeVisible()
    await expect(adminItem(page, item.name).getByRole('button', { name: 'Masquer' })).toHaveText('Visible')
    await expect(page).toHaveURL(/categorie=desserts$/)
    expect((await menuItem(item.id))?.is_visible).toBe(1)
    // The admin keeps working once the network is back.
    await page.unroute(isAction)
    await tabs(page).getByRole('link', { name: /^Antipasti/ }).click()
    await expect(page).toHaveURL(/categorie=antipasti$/)
  })
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
    // The category tabs scroll sideways; the current one is brought into view.
    await page.goto('/admin?categorie=sans_alcool')
    const current = tabs(page).getByRole('link', { name: /^Sans alcool/ })
    await expect.poll(async () => {
      const box = await current.boundingBox()
      return box!.x >= 0 && box!.x + box!.width <= 375
    }).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
    const item = adminItem(page, 'Soda Test 1')
    await item.getByRole('button', { name: 'Marquer indisponible' }).tap()
    await expect(item.getByRole('button', { name: 'Marquer disponible' })).toBeVisible()
    await item.getByRole('button', { name: 'Marquer disponible' }).tap()
    await expect(item.getByRole('button', { name: 'Marquer indisponible' })).toBeVisible()
    for (const name of ['Masquer', 'Marquer indisponible', 'Monter', 'Descendre', 'Modifier']) {
      const box = await item.getByRole(name === 'Modifier' ? 'link' : 'button', { name }).boundingBox()
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
    // Two levels per row at most.
    const rowHeight = (await item.boundingBox())!.height
    expect(rowHeight).toBeLessThan(140)

    await page.goto('/admin/menu/new')
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
    // Full-screen panel.
    expect((await drawer(page).boundingBox())!.width).toBe(375)
  })

  test('create with a validation error, edit, reorder and delete from a phone', async ({ page }) => {
    await login(page, 'theo')
    await page.goto('/admin?categorie=sans_alcool')
    await page.getByRole('link', { name: 'Ajouter un élément' }).tap()
    await expect(page.getByLabel('Catégorie')).toHaveValue('sans_alcool')
    await page.getByLabel('Nom').fill('Limonata')
    await page.getByLabel('Prix (€)').fill('3,5,0')
    await page.getByRole('button', { name: 'Enregistrer' }).tap()
    await expect(page.getByText(/Prix invalide/)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
    await page.getByLabel('Prix (€)').fill(' 3,50 ')
    await page.getByRole('button', { name: 'Enregistrer' }).tap()
    await expect(page).toHaveURL(/\/admin\?categorie=sans_alcool$/)
    await expect(adminItem(page, 'Limonata')).toContainText('3,50€')

    // New items go last: move it above the existing drink.
    await adminItem(page, 'Limonata').getByRole('button', { name: 'Monter' }).tap()
    await expect.poll(() => order(page, 'sans_alcool')).toEqual(['Limonata', 'Soda Test 1'])

    await adminItem(page, 'Limonata').getByRole('link', { name: 'Modifier' }).tap()
    await page.getByLabel('Description').fill('Citron de Sicile')
    await page.getByRole('button', { name: 'Enregistrer' }).tap()
    await expect(page).toHaveURL(/\/admin\?categorie=sans_alcool$/)

    // On a phone, deletion is in the edit panel.
    await expect(adminItem(page, 'Limonata').getByRole('link', { name: 'Supprimer' })).toBeHidden()
    await adminItem(page, 'Limonata').getByRole('link', { name: 'Modifier' }).tap()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
    await page.getByLabel('Je confirme la suppression').check()
    await page.getByRole('button', { name: 'Supprimer définitivement' }).tap()
    await expect(page).toHaveURL(/\/admin\?categorie=sans_alcool$/)
    await expect(adminItem(page, 'Limonata')).toHaveCount(0)
  })
})
