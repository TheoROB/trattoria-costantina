import { expect, test, type Page } from '@playwright/test'
import type { RowDataPacket } from 'mysql2/promise'
import {
  appendActionField,
  captureAction,
  formFieldName,
  removeActionField,
  replaceActionField,
  replayAction,
  type CapturedAction,
} from './helpers/actions'
import { fillItemForm, login, sessionToken } from './helpers/admin'
import { deleteSecurityData, execute, insertMenuItem, menuItemsFingerprint, query, uniqueItemName } from './helpers/db'

type CreateCapture = {
  action: CapturedAction
  itemName: string
  fields: { category: string; name: string; description: string; price: string; visible: string }
}

async function captureCreate(page: Page): Promise<CreateCapture> {
  await page.goto('/admin/menu/new')
  const itemName = uniqueItemName('validation')
  await fillItemForm(page, { name: itemName })
  const fields = {
    category: await formFieldName(page, 'Catégorie'),
    name: await formFieldName(page, 'Nom'),
    description: await formFieldName(page, 'Description'),
    price: await formFieldName(page, 'Prix (€)'),
    visible: await formFieldName(page, 'Visible sur le site'),
  }
  const action = await captureAction(page, () => page.getByRole('button', { name: 'Enregistrer' }).click())
  return { action, itemName, fields }
}

async function replayAndExpectNoWrite(action: CapturedAction, body: Buffer, token: string, baseURL: string) {
  const before = await menuItemsFingerprint()
  const response = await replayAction(action, { baseURL, token, body })
  try {
    const responseBody = await response.text()
    expect(await menuItemsFingerprint()).toBe(before)
    expect(response.status()).not.toBe(500)
    expect(responseBody).not.toMatch(/password_hash|token_hash|Error:\s|at\s+\S+\s+\([^)]*:\d+:/)
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

test('a captured valid Server Action can be replayed and reaches the create handler', async ({
  page,
  context,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const { action, itemName } = await captureCreate(page)
  const response = await replayAction(action, {
    baseURL,
    token: await sessionToken(context),
  })
  try {
    expect(response.status()).not.toBe(404)
    const rows = await query<RowDataPacket[]>('SELECT id FROM menu_items WHERE name = ?', [itemName])
    expect(rows).toHaveLength(1)
  } finally {
    await response.dispose()
  }
})

test('strict validation rejects invalid category, name and description payloads', async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const { action, fields } = await captureCreate(page)
  const token = await sessionToken(context)
  const cases = [
    { field: fields.category, value: 'sushi' },
    { field: fields.name, value: '   ' },
    { field: fields.name, value: 'n'.repeat(81) },
    { field: fields.description, value: 'd'.repeat(401) },
  ]

  for (const invalid of cases) {
    await replayAndExpectNoWrite(action, replaceActionField(action, invalid.field, invalid.value), token, baseURL)
  }
})

test('a forged invalid payload is rendered as an accessible page alert', async ({ page }) => {
  await page.goto('/admin/menu/new')
  const name = uniqueItemName('page alert')
  await fillItemForm(page, { name })
  const priceField = await formFieldName(page, 'Prix (€)')
  const before = await menuItemsFingerprint()

  await page.route('**/*', async (route) => {
    const request = route.request()
    if (request.method() !== 'POST' || !request.headers()['next-action']) {
      await route.continue()
      return
    }
    const body = request.postDataBuffer()
    if (!body) throw new Error('Server Action request has no body')
    const action = { url: request.url(), headers: request.headers(), body }
    await route.continue({ postData: replaceActionField(action, priceField, '12.345') })
  })
  try {
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    expect(await menuItemsFingerprint()).toBe(before)
  } finally {
    await page.unroute('**/*')
  }
})

for (const [field, value] of [
  ['unexpected_field', 'unexpected'],
  ['price_cents', '1'],
  ['id', '999999'],
  ['image_key', 'attacker-controlled'],
  ['position', '0'],
  ['admin_user_id', '1'],
  ['is_visible', '0'],
] as const) {
  test(`unknown or mass-assignment field ${field} rejects the entire payload`, async ({ page, context, baseURL }) => {
    if (!baseURL) throw new Error('Playwright baseURL is required')
    const { action, fields } = await captureCreate(page)
    const forgedField = field === 'is_visible' && fields.visible === field ? 'isVisible' : field
    await replayAndExpectNoWrite(
      action,
      appendActionField(action, forgedField, value),
      await sessionToken(context),
      baseURL,
    )
  })
}

for (const price of [
  '',
  '-1',
  '0',
  'text',
  '1e3',
  '12.345',
  '1000.01',
  '9999',
  '100000',
  '12 50',
  ' 12.50',
  '12.50 ',
]) {
  test(`server-side price validation rejects ${JSON.stringify(price)}`, async ({ page, context, baseURL }) => {
    if (!baseURL) throw new Error('Playwright baseURL is required')
    const { action, fields } = await captureCreate(page)
    await replayAndExpectNoWrite(
      action,
      replaceActionField(action, fields.price, price),
      await sessionToken(context),
      baseURL,
    )
  })
}

test('accepted price boundaries and separators are stored as exact integer cents', async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const { action, fields } = await captureCreate(page)
  const token = await sessionToken(context)
  for (const [price, expectedCents] of [
    ['0.01', 1],
    ['0,01', 1],
    ['12.50', 1250],
    ['1000', 100_000],
  ] as const) {
    const name = uniqueItemName(`accepted price ${price}`)
    let body = replaceActionField(action, fields.name, name)
    body = replaceActionField({ ...action, body }, fields.price, price)
    const response = await replayAction(action, { baseURL, token, body })
    try {
      const rows = await query<(RowDataPacket & { price_cents: number })[]>(
        'SELECT price_cents FROM menu_items WHERE name = ?',
        [name],
      )
      expect(rows).toHaveLength(1)
      expect(Number(rows[0].price_cents)).toBe(expectedCents)
    } finally {
      await response.dispose()
    }
  }
})

test('deletion without the confirmation field is refused server-side', async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const item = await insertMenuItem()
  await page.goto(`/admin/menu/${item.id}`)
  const confirmationField = await formFieldName(page, 'Je confirme la suppression')
  await page.getByLabel('Je confirme la suppression').check()
  const action = await captureAction(page, () => page.getByRole('button', { name: 'Supprimer définitivement' }).click())

  await replayAndExpectNoWrite(
    action,
    removeActionField(action, confirmationField),
    await sessionToken(context),
    baseURL,
  )
})

test('authenticated GET for a non-existent item is a clean 404', async ({ page }) => {
  const response = await page.goto('/admin/menu/999999')

  expect(response?.status()).toBe(404)
  expect(await page.locator('body').innerText()).not.toMatch(/Error:\s|at\s+\S+\s+\([^)]*:\d+:/)
})

test('a mutation whose bound item was deleted returns a clean page error', async ({ page }) => {
  const item = await insertMenuItem()
  await page.goto(`/admin/menu/${item.id}`)
  await page.getByLabel('Nom').fill(uniqueItemName('deleted target'))
  await execute('DELETE FROM menu_items WHERE id = ?', [item.id])

  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === 'POST' && Boolean(response.request().headers()['next-action']),
  )
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  const response = await responsePromise

  expect(response.status()).not.toBe(500)
  await expect(page.getByRole('alert')).toBeVisible()
  expect(await page.locator('body').innerText()).not.toMatch(/Error:\s|at\s+\S+\s+\([^)]*:\d+:/)
})

test('a replay targeting an item deleted after capture cannot recreate or mutate it', async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const item = await insertMenuItem()
  await page.goto(`/admin/menu/${item.id}`)
  await page.getByLabel('Je confirme la suppression').check()
  const action = await captureAction(page, () => page.getByRole('button', { name: 'Supprimer définitivement' }).click())
  await execute('DELETE FROM menu_items WHERE id = ?', [item.id])

  await replayAndExpectNoWrite(action, action.body, await sessionToken(context), baseURL)
})
