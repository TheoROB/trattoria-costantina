import { expect, test, type Locator, type Page } from '@playwright/test'
import { createItemThroughUi, fillItemForm, login, sessionToken } from './helpers/admin'
import { ADMIN_USERS } from './helpers/credentials'
import {
  adminUserId,
  auditRowsSince,
  deleteSecurityData,
  execute,
  insertMenuItem,
  latestAuditId,
  query,
  uniqueItemName,
} from './helpers/db'
import type { RowDataPacket } from 'mysql2/promise'

type PositionRow = RowDataPacket & { id: number; position: number }

let originalPositions: PositionRow[] = []

async function clickAction(page: Page, button: Locator) {
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === 'POST' && Boolean(response.request().headers()['next-action']),
  )
  await button.click()
  const response = await responsePromise
  expect(response.status()).not.toBe(500)
}

test.beforeEach(async ({ page }) => {
  originalPositions = await query<PositionRow[]>('SELECT id, position FROM menu_items ORDER BY id')
  await login(page)
})

test.afterEach(async () => {
  for (const item of originalPositions) {
    await execute('UPDATE menu_items SET position = ? WHERE id = ?', [item.position, item.id])
  }
  await deleteSecurityData()
  await execute('DELETE FROM admin_sessions')
})

test('admin dashboard exposes the contracted controls and category order', async ({ page }) => {
  await page.goto('/admin')

  await expect(page.getByRole('heading', { level: 1, name: 'La carte' })).toBeVisible()
  const categoryNames = ['Antipasti', 'Pâtes & Plats', 'Pizzas', 'Desserts', 'Boissons']
  const headings = await page.getByRole('heading', { level: 2 }).allTextContents()
  expect(headings.filter((heading) => categoryNames.includes(heading))).toEqual([
    'Antipasti',
    'Pâtes & Plats',
    'Pizzas',
    'Desserts',
    'Boissons',
  ])
  const item = page.locator('li[data-item-id]').filter({ hasText: 'Pizza Test 1' })
  await expect(item).toContainText('11')
  await expect(item.getByRole('button', { name: 'Monter' })).toBeVisible()
  await expect(item.getByRole('button', { name: 'Descendre' })).toBeVisible()
  await expect(item.getByRole('button', { name: /Masquer|Afficher/ })).toBeVisible()
  await expect(item.getByRole('button', { name: /Marquer (?:in)?disponible/ })).toBeVisible()
  await expect(item.getByRole('link', { name: 'Modifier' })).toHaveAttribute('href', /\/admin\/menu\/\d+$/)
  await expect(page.getByRole('link', { name: 'Nouvel élément' })).toHaveAttribute('href', '/admin/menu/new')
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible()
  const reservations = page.getByText('Réservations').locator('..')
  await expect(reservations).toContainText('Les réservations sont gérées via DISH Reservation.')
})

test('item forms expose only the contracted fields and no file upload', async ({ page }) => {
  await page.goto('/admin/menu/new')

  await expect(page.getByLabel('Catégorie')).toBeVisible()
  await expect(page.getByLabel('Nom')).toBeVisible()
  await expect(page.getByLabel('Description')).toBeVisible()
  await expect(page.getByLabel('Prix (€)')).toHaveAttribute('type', 'text')
  await expect(page.getByLabel('Disponible')).toHaveAttribute('type', 'checkbox')
  await expect(page.getByLabel('Visible sur le site')).toHaveAttribute('type', 'checkbox')
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeVisible()
  await expect(page.locator('input[type="file"]')).toHaveCount(0)
})

test('create, update, toggles, reorder and delete write attributable non-sensitive audit rows', async ({ page }) => {
  const auditStart = await latestAuditId()
  const adminId = await adminUserId(ADMIN_USERS.julien.email)
  const token = await sessionToken(page.context())
  const neighbor = await insertMenuItem({ name: uniqueItemName('audit reorder neighbor'), position: 9000 })
  const originalName = uniqueItemName('audit lifecycle')
  await createItemThroughUi(page, originalName)
  const created = await query<(RowDataPacket & { id: number })[]>('SELECT id FROM menu_items WHERE name = ?', [originalName])
  expect(created).toHaveLength(1)
  const id = Number(created[0].id)

  const updatedName = uniqueItemName('audit updated')
  await page.goto(`/admin/menu/${id}`)
  await page.getByLabel('Nom').fill(updatedName)
  await page.getByLabel('Prix (€)').fill('13.75')
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/admin'),
    page.getByRole('button', { name: 'Enregistrer' }).click(),
  ])

  await execute('UPDATE menu_items SET position = ? WHERE id = ?', [9000, neighbor.id])
  await execute('UPDATE menu_items SET position = ? WHERE id = ?', [9001, id])
  await page.reload()

  let item = page.locator(`li[data-item-id="${id}"]`)
  await clickAction(page, item.getByRole('button', { name: 'Marquer indisponible' }))
  item = page.locator(`li[data-item-id="${id}"]`)
  await expect(item.getByRole('button', { name: 'Marquer disponible' })).toBeVisible()
  await clickAction(page, item.getByRole('button', { name: 'Masquer' }))
  item = page.locator(`li[data-item-id="${id}"]`)
  await expect(item.getByRole('button', { name: 'Afficher' })).toBeVisible()
  await clickAction(page, item.getByRole('button', { name: 'Monter' }))

  await page.goto(`/admin/menu/${id}`)
  await page.getByLabel('Je confirme la suppression').check()
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/admin'),
    page.getByRole('button', { name: 'Supprimer définitivement' }).click(),
  ])

  const rows = await auditRowsSince(auditStart)
  expect(rows.map(({ action }) => action)).toEqual([
    'menu_item.create',
    'menu_item.update',
    'menu_item.set_available',
    'menu_item.set_visible',
    'menu_item.move',
    'menu_item.delete',
  ])
  expect(rows.every(({ admin_user_id }) => admin_user_id === adminId)).toBe(true)
  expect(rows.every(({ menu_item_id }) => menu_item_id === id)).toBe(true)
  const serialized = JSON.stringify(rows)
  expect(serialized).not.toContain(ADMIN_USERS.julien.password)
  expect(serialized).not.toContain(token)
  expect(serialized).not.toMatch(/cookie|token|password|DATABASE_URL|AUTH_HMAC_SECRET/i)
})

test('HTML entered in a visible description is rendered as text on the public menu', async ({ page }) => {
  const name = uniqueItemName('html description')
  const description = '<img src=x onerror="document.body.dataset.injected=1">'
  await page.goto('/admin/menu/new')
  await fillItemForm(page, { name, description })
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/admin'),
    page.getByRole('button', { name: 'Enregistrer' }).click(),
  ])

  await page.goto('/carte')

  await expect(page.getByText(description)).toBeVisible()
  expect(await page.locator('body').getAttribute('data-injected')).toBeNull()
  await expect(page.locator('img[onerror]')).toHaveCount(0)
})
