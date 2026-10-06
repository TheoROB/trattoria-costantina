import fs from 'node:fs'
import { expect, request as playwrightRequest, test, type Page } from '@playwright/test'
import type { RowDataPacket } from 'mysql2/promise'
import { login, sessionToken } from './helpers/admin'
import { ADMIN_USERS, SESSION_COOKIE } from './helpers/credentials'
import { execute, query } from './helpers/db'

function expectAdminHeaders(headers: Record<string, string>) {
  expect(headers['x-robots-tag']).toBe('noindex, nofollow')
  expect(headers['cache-control']).toContain('no-store')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains')
  expect(headers['x-powered-by']).toBeUndefined()
  const csp = headers['content-security-policy']
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/)
  expect(csp).not.toContain('unsafe-inline')
  expect(csp).not.toContain('unsafe-eval')
  expect(csp).toContain('frame-src https://reservation.dish.co')
  expect(csp).toContain("frame-ancestors 'none'")
}

async function expectRobotsMeta(page: Page) {
  const contents = await page.locator('meta[name="robots"]').evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('content') ?? ''),
  )
  expect(contents.length).toBeGreaterThan(0)
  expect(contents.every((content) => content.includes('noindex'))).toBe(true)
  expect(contents).toContain('noindex, nofollow')
}

test.afterEach(async () => {
  await execute('DELETE FROM admin_audit_log')
  await execute('DELETE FROM admin_sessions')
  await execute('DELETE FROM login_attempts')
})

test('login page is noindex, no-store and preserves all baseline security headers', async ({ page }) => {
  const response = await page.goto('/admin/login')
  if (!response) throw new Error('Missing document response')

  expectAdminHeaders(response.headers())
  await expectRobotsMeta(page)
})

test('all authenticated admin pages are noindex, no-store and preserve baseline security headers', async ({ page }) => {
  await login(page)
  const items = await query<(RowDataPacket & { id: number })[]>('SELECT id FROM menu_items ORDER BY id LIMIT 1')
  if (items.length !== 1) throw new Error('Expected at least one menu fixture')
  const paths = ['/admin', '/admin/menu/new', `/admin/menu/${items[0].id}`, '/admin/menu/999999']
  const nonces: string[] = []

  for (const path of paths) {
    const response = await page.goto(path)
    if (!response) throw new Error(`Missing document response for ${path}`)
    expectAdminHeaders(response.headers())
    await expectRobotsMeta(page)
    const nonce = response.headers()['content-security-policy'].match(/'nonce-([^']+)'/)?.[1]
    expect(nonce).toBeTruthy()
    nonces.push(nonce ?? '')
  }
  expect(new Set(nonces).size).toBe(paths.length)
})

for (const path of ['/admin/login', '/admin']) {
  test(`${path} runs under nonce CSP without console errors or violations`, async ({ page }) => {
    const errors: string[] = []
    await page.addInitScript(() => {
      const state = window as typeof window & { __securityCspViolations?: string[] }
      state.__securityCspViolations = []
      document.addEventListener('securitypolicyviolation', (event) => {
        state.__securityCspViolations?.push(`${event.violatedDirective}: ${event.blockedURI}`)
      })
    })
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
    page.on('pageerror', (error) => errors.push(error.message))
    if (path === '/admin') await login(page)

    await page.goto(path, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)

    expect(errors).toEqual([])
    const violations = await page.evaluate(
      () => (window as typeof window & { __securityCspViolations?: string[] }).__securityCspViolations ?? [],
    )
    expect(violations).toEqual([])
  })
}

test('admin HTML, RSC responses and server logs never expose credentials or secrets', async ({
  page,
  context,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const responseBodies: string[] = []

  const loginDocument = await page.goto('/admin/login')
  if (!loginDocument) throw new Error('Missing login document response')
  responseBodies.push(await loginDocument.text())
  const loginActionPromise = page.waitForResponse(
    (response) => response.request().method() === 'POST' && Boolean(response.request().headers()['next-action']),
  )
  await login(page)
  responseBodies.push(await (await loginActionPromise).text())
  const token = await sessionToken(context)
  for (const path of ['/admin/menu/new', '/admin']) {
    const response = await page.goto(path)
    if (!response) throw new Error(`Missing document response for ${path}`)
    responseBodies.push(await response.text())
  }

  const api = await playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: { cookie: `${SESSION_COOKIE}=${token}` },
  })
  const adminResponse = await api.get('/admin')
  const formResponse = await api.get('/admin/menu/new')
  responseBodies.push(await adminResponse.text())
  responseBodies.push(await formResponse.text())
  await api.dispose()

  const logPath = '.e2e-logs/server.log'
  expect(fs.existsSync(logPath)).toBe(true)
  const inspected = `${responseBodies.join('\n')}\n${fs.readFileSync(logPath, 'utf8')}`
  const forbidden = [
    ADMIN_USERS.julien.password,
    ADMIN_USERS.theo.password,
    token,
    'password_hash',
    'token_hash',
  ]
  for (const environmentName of ['AUTH_HMAC_SECRET', 'DATABASE_URL'] as const) {
    forbidden.push(environmentName)
    const value = process.env[environmentName]
    if (value) forbidden.push(value)
  }
  if (process.env.DATABASE_URL_TEST) forbidden.push(process.env.DATABASE_URL_TEST)

  for (const secret of forbidden) expect(inspected).not.toContain(secret)
})
