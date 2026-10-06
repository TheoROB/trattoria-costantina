import { createHash } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import type { RowDataPacket } from 'mysql2/promise'
import { captureAction, formFieldName, replaceActionField, replayAction } from './helpers/actions'
import { expectLoginFailure, login, logout, sessionToken } from './helpers/admin'
import { ADMIN_USERS, GENERIC_LOGIN_ERROR, SESSION_COOKIE } from './helpers/credentials'
import {
  adminUserId,
  auditRowsSince,
  deleteSecurityData,
  execute,
  expireSessions,
  latestAuditId,
  moveLoginAttemptsOutsideWindow,
  query,
  sessionCount,
} from './helpers/db'

function secureCookieUrl(baseURL: string) {
  const url = new URL(baseURL)
  url.protocol = 'https:'
  return url.toString()
}

async function gotoAdminAndExpectCookie(page: Page, token: string) {
  const requestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return request.isNavigationRequest() && url.pathname === '/admin'
  })
  await page.goto('/admin')
  const request = await requestPromise
  expect((await request.allHeaders()).cookie).toContain(`${SESSION_COOKIE}=${token}`)
}

test.afterEach(async () => {
  await deleteSecurityData()
  await execute('DELETE FROM admin_sessions')
})

test('anonymous admin access redirects to login without returning or rendering admin data', async ({ page, request }) => {
  const direct = await request.get('/admin', { maxRedirects: 0 })
  const directBody = await direct.text()
  for (const marker of ['Antipasto Test 1', 'Pizza Test 1', 'Dessert Test 1']) {
    expect(directBody).not.toContain(marker)
  }
  await page.goto('/admin')

  await expect(page).toHaveURL(/\/admin\/login$/)
  await expect(page.getByRole('heading', { name: 'La carte' })).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('Antipasto Test 1')
})

test('wrong passwords and unknown accounts return the same generic error', async ({ page }) => {
  await expectLoginFailure(page, ADMIN_USERS.julien.email, 'incorrect-password')
  await expectLoginFailure(page, 'unknown@admin.test', 'incorrect-password')
})

test('malformed and oversized credentials are refused by the server with the generic error', async ({
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  await page.goto('/admin/login')
  await page.getByLabel('Email').fill(ADMIN_USERS.julien.email)
  await page.getByLabel('Mot de passe').fill(ADMIN_USERS.julien.password)
  const emailField = await formFieldName(page, 'Email')
  const passwordField = await formFieldName(page, 'Mot de passe')
  const action = await captureAction(page, () => page.getByRole('button', { name: 'Se connecter' }).click())

  for (const body of [
    replaceActionField(action, emailField, 'not-an-email'),
    replaceActionField(action, passwordField, 'x'.repeat(10_000)),
  ]) {
    const response = await replayAction(action, { baseURL, body })
    try {
      expect(await response.text()).toContain(GENERIC_LOGIN_ERROR)
      expect(await sessionCount(ADMIN_USERS.julien.email)).toBe(0)
    } finally {
      await response.dispose()
    }
  }
})

test('an expired session is refused on protected pages', async ({ page }) => {
  await login(page)
  await expireSessions(ADMIN_USERS.julien.email)

  await page.goto('/admin')

  await expect(page).toHaveURL(/\/admin\/login$/)
  await expect(page.getByRole('heading', { name: 'La carte' })).toHaveCount(0)
})

test('a random forged session cookie is refused', async ({ context, page, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: 'forged-random-session-token',
      url: secureCookieUrl(baseURL),
      secure: true,
      httpOnly: true,
      sameSite: 'Strict',
    },
  ])

  await gotoAdminAndExpectCookie(page, 'forged-random-session-token')

  await expect(page).toHaveURL(/\/admin\/login$/)
})

test('session cookies use the required host-only security attributes and eight-hour lifetime', async ({
  context,
  page,
}) => {
  const before = Date.now() / 1000
  await login(page)
  const cookie = (await context.cookies()).find(({ name }) => name === SESSION_COOKIE)

  expect(cookie).toBeDefined()
  expect(cookie?.httpOnly).toBe(true)
  expect(cookie?.secure).toBe(true)
  expect(cookie?.sameSite).toBe('Strict')
  expect(cookie?.path).toBe('/')
  expect(cookie?.domain.startsWith('.')).toBe(false)
  expect(cookie?.expires).toBeGreaterThanOrEqual(before + 8 * 60 * 60 - 60)
  expect(cookie?.expires).toBeLessThanOrEqual(before + 8 * 60 * 60 + 60)
})

test('the database stores only the session token SHA-256 with an eight-hour lifetime', async ({ page, context }) => {
  await login(page)
  const token = await sessionToken(context)
  const rows = await query<
    (RowDataPacket & { tokenHash: string; lifetimeSeconds: number })[]
  >(
    `SELECT HEX(token_hash) AS tokenHash,
            TIMESTAMPDIFF(SECOND, created_at, expires_at) AS lifetimeSeconds
       FROM admin_sessions
      WHERE admin_user_id = (SELECT id FROM admin_users WHERE email = ?)`,
    [ADMIN_USERS.julien.email],
  )

  expect(rows).toHaveLength(1)
  expect(rows[0].tokenHash.toLowerCase()).toBe(createHash('sha256').update(token).digest('hex'))
  expect(Number(rows[0].lifetimeSeconds)).toBe(8 * 60 * 60)
})

test('each login issues a fresh opaque token and logged-in users skip the login page', async ({ page }) => {
  await login(page)
  const first = await sessionToken(page.context())
  await page.goto('/admin/login')
  await expect(page).toHaveURL(/\/admin$/)
  await logout(page)

  await login(page)
  const second = await sessionToken(page.context())

  expect(first).not.toBe(second)
  expect(first).not.toMatch(/julien|admin|test/i)
})

test('logout deletes the server session and the old cookie is refused', async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  await login(page)
  const oldToken = await sessionToken(context)
  expect(await sessionCount(ADMIN_USERS.julien.email)).toBe(1)

  await logout(page)

  expect(await sessionCount(ADMIN_USERS.julien.email)).toBe(0)
  expect((await context.cookies()).some(({ name }) => name === SESSION_COOKIE)).toBe(false)
  await context.addCookies([
    { name: SESSION_COOKIE, value: oldToken, url: secureCookieUrl(baseURL), secure: true },
  ])
  await gotoAdminAndExpectCookie(page, oldToken)
  await expect(page).toHaveURL(/\/admin\/login$/)
})

test('login and logout audit rows identify the acting administrator without secrets', async ({ page }) => {
  const auditStart = await latestAuditId()
  const adminId = await adminUserId(ADMIN_USERS.julien.email)

  await login(page)
  const token = await sessionToken(page.context())
  await logout(page)

  const rows = await auditRowsSince(auditStart)
  expect(rows.map(({ action }) => action)).toEqual(['auth.login', 'auth.logout'])
  expect(rows.every(({ admin_user_id }) => admin_user_id === adminId)).toBe(true)
  const serialized = JSON.stringify(rows)
  expect(serialized).not.toMatch(/password|token|cookie|DATABASE_URL|AUTH_HMAC_SECRET/i)
  expect(serialized).not.toContain(token)
  expect(serialized).not.toContain(ADMIN_USERS.julien.password)
  expect(serialized).not.toContain(ADMIN_USERS.theo.password)
})

test('five failures lock the known account until the fifteen-minute window passes', async ({ page }) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await expectLoginFailure(page, ADMIN_USERS.julien.email, `wrong-${attempt}`)
  }

  await expectLoginFailure(page, ADMIN_USERS.julien.email, ADMIN_USERS.julien.password)
  await moveLoginAttemptsOutsideWindow()
  await login(page)
})

test('unknown emails are rate-limited with the same generic response', async ({ page }) => {
  const email = `unknown-${Date.now()}@admin.test`
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await expectLoginFailure(page, email, `wrong-${attempt}`)
  }

  await execute('UPDATE admin_users SET email = ? WHERE email = ?', [email, ADMIN_USERS.theo.email])
  try {
    await expectLoginFailure(page, email, ADMIN_USERS.theo.password)
    await moveLoginAttemptsOutsideWindow()
    await login(page, { email, password: ADMIN_USERS.theo.password })
  } finally {
    await execute('UPDATE admin_users SET email = ? WHERE email = ?', [ADMIN_USERS.theo.email, email])
  }
})

for (const account of Object.values(ADMIN_USERS)) {
  test(`${account.email} has access to the same admin page`, async ({ page }) => {
    await login(page, account)
    await expect(page.getByRole('heading', { level: 1, name: 'La carte' })).toBeVisible()
  })
}

for (const path of ['/admin/signup', '/admin/register']) {
  test(`${path} does not expose account creation`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status()).toBe(404)
  })
}
