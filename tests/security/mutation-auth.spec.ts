import { expect, test, type Page } from '@playwright/test'
import { captureAction, replayAction, type CapturedAction } from './helpers/actions'
import { fillItemForm, login, logout, sessionToken } from './helpers/admin'
import { ADMIN_USERS } from './helpers/credentials'
import {
  deleteSecurityData,
  execute,
  expireSessions,
  insertMenuItem,
  menuItemsFingerprint,
  uniqueItemName,
} from './helpers/db'

async function captureCreate(page: Page) {
  await page.goto('/admin/menu/new')
  await fillItemForm(page, { name: uniqueItemName('captured create') })
  return captureAction(page, () => page.getByRole('button', { name: 'Enregistrer' }).click())
}

async function captureEdit(page: Page, id: number, buttonName: string) {
  await page.goto(`/admin/menu/${id}`)
  if (buttonName === 'Enregistrer') await page.getByLabel('Nom').fill(uniqueItemName('captured update'))
  if (buttonName === 'Supprimer définitivement') {
    await page.getByLabel('Je confirme la suppression').check()
  }
  return captureAction(page, () => page.getByRole('button', { name: buttonName }).click())
}

async function captureListAction(page: Page, id: number, buttonName: RegExp) {
  await page.goto('/admin')
  const item = page.locator(`li[data-item-id="${id}"]`)
  return captureAction(page, () => item.getByRole('button', { name: buttonName }).click())
}

async function expectReplayLeavesMenuUntouched(
  action: CapturedAction,
  baseURL: string,
  options: { token?: string; origin?: string; method?: 'GET' | 'POST' } = {},
) {
  const before = await menuItemsFingerprint()
  const response = await replayAction(action, { baseURL, ...options })
  try {
    const body = await response.text()
    expect(await menuItemsFingerprint()).toBe(before)
    expect(response.status()).not.toBe(404)
    for (const marker of ['Antipasto Test 1', 'Pizza Test 1', 'Dessert Test 1']) {
      expect(body).not.toContain(marker)
    }
    expect(body).not.toContain('password_hash')
    expect(body).not.toContain('token_hash')
    return { ok: response.ok() }
  } finally {
    await response.dispose()
  }
}

test.beforeEach(async ({ page }) => {
  await login(page)
})

test.afterEach(async () => {
  await deleteSecurityData()
  await execute('DELETE FROM admin_sessions')
})

test('a create Server Action without a cookie cannot change the database', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  await expectReplayLeavesMenuUntouched(await captureCreate(page), baseURL)
})

test('an update Server Action without a cookie cannot change the database', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const item = await insertMenuItem()
  await expectReplayLeavesMenuUntouched(await captureEdit(page, item.id, 'Enregistrer'), baseURL)
})

test('a delete Server Action without a cookie cannot change the database', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const item = await insertMenuItem()
  await expectReplayLeavesMenuUntouched(await captureEdit(page, item.id, 'Supprimer définitivement'), baseURL)
})

for (const action of [
  { label: 'availability toggle', button: /Marquer (?:in)?disponible/ },
  { label: 'visibility toggle', button: /(?:Masquer|Afficher)/ },
  { label: 'reorder', button: /Monter/ },
]) {
  test(`a ${action.label} Server Action without a cookie cannot change the database`, async ({ page, baseURL }) => {
    if (!baseURL) throw new Error('Playwright baseURL is required')
    const item = await insertMenuItem()
    await expectReplayLeavesMenuUntouched(await captureListAction(page, item.id, action.button), baseURL)
  })
}

test('a random forged cookie cannot authorize a Server Action', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  await expectReplayLeavesMenuUntouched(await captureCreate(page), baseURL, {
    token: 'forged-random-session-token',
  })
})

test('an expired cookie cannot authorize a Server Action', async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const action = await captureCreate(page)
  const token = await sessionToken(context)
  await expireSessions(ADMIN_USERS.julien.email)

  await expectReplayLeavesMenuUntouched(action, baseURL, { token })
})

test('logout revokes the old cookie for Server Actions', async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const action = await captureCreate(page)
  const token = await sessionToken(context)
  await logout(page)

  await expectReplayLeavesMenuUntouched(action, baseURL, { token })
})

test('a cross-origin Server Action is rejected even with a valid cookie', async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const action = await captureCreate(page)
  const token = await sessionToken(context)
  const response = await expectReplayLeavesMenuUntouched(action, baseURL, {
    token,
    origin: 'https://attacker.invalid',
  })
  expect(response.ok).toBe(false)
})

test('GET with a Server Action header is never a mutation', async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const action = await captureCreate(page)
  const token = await sessionToken(context)
  await expectReplayLeavesMenuUntouched(action, baseURL, { token, method: 'GET' })
})
