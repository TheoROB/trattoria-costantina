import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import type { RowDataPacket } from 'mysql2/promise'
import sharp from 'sharp'
import { appendActionField, captureAction, replayAction } from '../../security/helpers/actions'
import { sessionToken } from '../../security/helpers/admin'
import { SESSION_COOKIE } from '../../security/helpers/credentials'
import { execute, query } from '../../security/helpers/db'
import { E2E_MEDIA_ROOT } from '../media-root'
import { ADMINS } from './credentials'

// Shared test database and media directory: the scenarios build on each other.
test.describe.configure({ mode: 'serial' })

const MENU_DIR = path.join(E2E_MEDIA_ROOT, 'menu')
const NAME = 'Pizza Photo Test'

type Upload = { name: string; mimeType: string; buffer: Buffer }
const files: Record<'jpeg' | 'png' | 'webp' | 'small' | 'svg' | 'fakeJpg' | 'heic', Upload> = {} as never

test.beforeAll(async () => {
  const base = () => sharp({ create: { width: 900, height: 700, channels: 3, background: '#c47a3a' } })
  files.jpeg = {
    name: 'IMG_0001.jpg',
    mimeType: 'image/jpeg',
    buffer: await base().jpeg().withMetadata({ orientation: 6 }).withExif({ IFD0: { Copyright: 'secret-owner', Make: 'PhoneMaker' } }).toBuffer(),
  }
  files.png = { name: 'photo.png', mimeType: 'image/png', buffer: await base().png().toBuffer() }
  files.webp = { name: 'photo.webp', mimeType: 'image/webp', buffer: await base().webp().toBuffer() }
  files.small = { name: 'small.jpg', mimeType: 'image/jpeg', buffer: await sharp({ create: { width: 200, height: 200, channels: 3, background: '#fff' } }).jpeg().toBuffer() }
  files.svg = {
    name: 'logo.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><script>alert(1)</script><rect width="900" height="900"/></svg>'),
  }
  files.fakeJpg = { name: 'notes.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image at all') }
  files.heic = {
    name: 'IMG_0002.HEIC',
    mimeType: 'image/heic',
    buffer: Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.from([0, 0, 0, 0]), Buffer.from('mif1heic'), Buffer.alloc(4000)]),
  }
})

async function login(page: Page) {
  await page.goto('/admin/login')
  await page.getByLabel('Email').fill(ADMINS.julien.email)
  await page.getByLabel('Mot de passe').fill(ADMINS.julien.password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/admin$/)
}

const adminItem = (page: Page, name: string) =>
  page.locator('li[data-item-id]').filter({ has: page.getByText(name, { exact: true }) })

async function itemRow(name: string) {
  const rows = await query<RowDataPacket[]>('SELECT id, image_key FROM menu_items WHERE name = ?', [name])
  return rows[0] as unknown as { id: number; image_key: string | null }
}
const mediaFiles = () => (fs.existsSync(MENU_DIR) ? fs.readdirSync(MENU_DIR).sort() : [])
const variantsOf = (key: string) => [`${key}-160.webp`, `${key}-320.webp`]

async function editPhoto(page: Page, name: string, upload: Upload) {
  await page.goto('/admin')
  await adminItem(page, name).getByRole('link', { name: 'Modifier' }).click()
  await page.getByLabel(/photo/i).setInputFiles(upload)
  await page.getByRole('button', { name: 'Enregistrer' }).click()
}

async function auditActions(itemId: number) {
  const rows = await query<RowDataPacket[]>("SELECT action FROM admin_audit_log WHERE menu_item_id = ? AND action LIKE 'menu_item.photo_%' ORDER BY id", [itemId])
  return (rows as unknown as { action: string }[]).map((r) => r.action)
}

test('creates an item with a JPEG photo, served as metadata-free WebP with long cache', async ({ page, request }) => {
  await login(page)
  await page.goto('/admin/menu/new')
  await page.getByLabel('Catégorie').selectOption('pizzas')
  await page.getByLabel('Nom').fill(NAME)
  await page.getByLabel('Prix (€)').fill('12')
  await page.getByLabel('Photo (facultatif)').setInputFiles(files.jpeg)
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await expect(adminItem(page, NAME)).toContainText('Photo')

  const { id, image_key: key } = await itemRow(NAME)
  expect(key).toMatch(/^[a-f0-9]{32}$/)
  expect(mediaFiles()).toEqual(expect.arrayContaining(variantsOf(key!)))
  expect(await auditActions(id)).toEqual(['menu_item.photo_add'])

  await page.goto('/carte')
  const thumb = page.locator('.menu-items li').filter({ hasText: NAME }).locator('img.menu-thumb')
  await expect(thumb).toHaveAttribute('src', `/media/menu/${key}-160.webp`)
  await expect(thumb).toHaveAttribute('alt', '')
  await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0)

  for (const size of [160, 320]) {
    const response = await request.get(`/media/menu/${key}-${size}.webp`)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('image/webp')
    expect(response.headers()['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(response.headers()['x-content-type-options']).toBe('nosniff')
    const body = await response.body()
    expect(body.includes('secret-owner')).toBe(false)
    const meta = await sharp(body).metadata()
    expect([meta.format, meta.width, meta.height, meta.exif]).toEqual(['webp', size, size, undefined])
  }
})

test('adds a PNG photo to an item that had none', async ({ page }) => {
  await login(page)
  await editPhoto(page, 'Pizza Test 3', files.png)
  await expect(page).toHaveURL(/\/admin$/)
  const { id, image_key: key } = await itemRow('Pizza Test 3')
  expect(mediaFiles()).toEqual(expect.arrayContaining(variantsOf(key!)))
  expect(await auditActions(id)).toEqual(['menu_item.photo_add'])
})

test('replaces a photo with a WebP: new URL, old files deleted only after the switch', async ({ page, request }) => {
  await login(page)
  const before = await itemRow(NAME)
  await editPhoto(page, NAME, files.webp)
  await expect(page).toHaveURL(/\/admin$/)
  const after = await itemRow(NAME)
  expect(after.image_key).toMatch(/^[a-f0-9]{32}$/)
  expect(after.image_key).not.toBe(before.image_key)
  expect(mediaFiles()).toEqual(expect.arrayContaining(variantsOf(after.image_key!)))
  expect(mediaFiles()).not.toContain(variantsOf(before.image_key!)[0])
  expect((await request.get(`/media/menu/${before.image_key}-160.webp`)).status()).toBe(404)
  expect((await request.get(`/media/menu/${after.image_key}-160.webp`)).status()).toBe(200)
  expect(await auditActions(after.id)).toEqual(['menu_item.photo_add', 'menu_item.photo_replace'])
})

test.describe('a refused replacement keeps the current photo and writes no file', () => {
  for (const [label, file, message] of [
    ['SVG renamed .jpg', 'svg', /Format non pris en charge/],
    ['text file renamed .jpg', 'fakeJpg', /Format non pris en charge/],
    ['HEIC', 'heic', /HEIC ne sont pas prises en charge/],
    ['too small', 'small', /trop petite/],
  ] as const) {
    test(label, async ({ page, request }) => {
      await login(page)
      const before = await itemRow(NAME)
      const filesBefore = mediaFiles()
      await editPhoto(page, NAME, files[file])
      await expect(page).toHaveURL(new RegExp(`/admin/menu/${before.id}\\?photo=`))
      await expect(page.locator('#photo-upload-error')).toHaveText(message)
      await expect(page.getByLabel('Nom')).toHaveValue(NAME)
      expect(await itemRow(NAME)).toEqual(before)
      expect(mediaFiles()).toEqual(filesBefore)
      expect((await request.get(`/media/menu/${before.image_key}-160.webp`)).status()).toBe(200)
    })
  }
})

test('the browser refuses a file over 10 MB before sending it', async ({ page }) => {
  await login(page)
  const before = await itemRow(NAME)
  await page.goto('/admin')
  await adminItem(page, NAME).getByRole('link', { name: 'Modifier' }).click()
  const input = page.getByLabel(/photo/i)
  await input.setInputFiles({ name: 'big.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) })
  expect(await input.evaluate((el: HTMLInputElement) => el.validationMessage)).toContain('10 Mo')
  let posted = false
  page.on('request', (r) => (posted ||= r.method() === 'POST'))
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await page.waitForTimeout(300)
  expect(posted).toBe(false)
  expect(await itemRow(NAME)).toEqual(before)
})

test('uploads are rate limited per account', async ({ page }) => {
  await login(page)
  const [{ id: adminId }] = (await query<RowDataPacket[]>('SELECT id FROM admin_users WHERE email = ?', [ADMINS.julien.email])) as unknown as { id: number }[]
  await execute('DELETE FROM media_upload_attempts')
  for (let i = 0; i < 20; i++) await execute('INSERT INTO media_upload_attempts (admin_user_id, created_at) VALUES (?, UTC_TIMESTAMP(3))', [adminId])
  const before = await itemRow(NAME)
  await editPhoto(page, NAME, files.png)
  await expect(page.locator('#photo-upload-error')).toHaveText(/Trop de photos/)
  expect(await itemRow(NAME)).toEqual(before)
  await execute('DELETE FROM media_upload_attempts')
})

function multipart(parts: { name: string; filename?: string; type?: string; data: Buffer | string }[]) {
  const boundary = '----trattoria-e2e-boundary'
  const chunks = parts.flatMap(({ name, filename, type, data }) => [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"${filename ? `; filename="${filename}"` : ''}\r\n`),
    Buffer.from(type ? `Content-Type: ${type}\r\n\r\n` : '\r\n'),
    Buffer.isBuffer(data) ? data : Buffer.from(data),
    Buffer.from('\r\n'),
  ])
  return { body: Buffer.concat([...chunks, Buffer.from(`--${boundary}--\r\n`)]), contentType: `multipart/form-data; boundary=${boundary}` }
}

test.describe('the photo upload endpoint', () => {
  let token: string
  let itemId: number
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await login(page)
    token = await sessionToken(page.context())
    await page.close()
    itemId = (await itemRow('Dessert Test 1')).id
  })

  const photo = () => multipart([{ name: 'photo', filename: 'IMG.jpg', type: 'image/jpeg', data: files.jpeg.buffer }])
  async function post(request: import('@playwright/test').APIRequestContext, baseURL: string, options: {
    token?: string; origin?: string | null; contentType?: string; body?: Buffer; headers?: Record<string, string>; id?: string | number
  } = {}) {
    const { body, contentType } = options.body ? { body: options.body, contentType: options.contentType ?? photo().contentType } : photo()
    const headers: Record<string, string> = { 'content-type': options.contentType ?? contentType, ...options.headers }
    if (options.origin !== null) headers.origin = options.origin ?? baseURL
    if (options.token) headers.cookie = `${SESSION_COOKIE}=${options.token}`
    return request.post(`/api/admin/menu/${options.id ?? itemId}/photo`, { headers, data: body, maxRedirects: 0 })
  }

  test('refuses every request that is not an authenticated same-origin multipart upload, writing nothing', async ({ request, baseURL }) => {
    const before = await itemRow('Dessert Test 1')
    const filesBefore = mediaFiles()
    const cases: [string, Promise<import('@playwright/test').APIResponse>, number][] = [
      ['no cookie', post(request, baseURL!), 401],
      ['forged cookie', post(request, baseURL!, { token: 'A'.repeat(43) }), 401],
      ['cross-origin', post(request, baseURL!, { token, origin: 'https://evil.example' }), 403],
      ['no Origin header', post(request, baseURL!, { token, origin: null }), 403],
      ['invalid id', post(request, baseURL!, { token, id: '1abc' }), 404],
      ['unknown id', post(request, baseURL!, { token, id: 999999 }), 404],
      ['not multipart', post(request, baseURL!, { token, contentType: 'image/jpeg', body: files.jpeg.buffer }), 415],
      ['body over the limit', post(request, baseURL!, { token, body: multipart([{ name: 'photo', filename: 'big.jpg', type: 'image/jpeg', data: Buffer.alloc(10 * 1024 * 1024 + 100 * 1024, 1) }]).body }), 413],
      ['extra field', post(request, baseURL!, { token, body: multipart([{ name: 'photo', filename: 'a.jpg', type: 'image/jpeg', data: files.jpeg.buffer }, { name: 'image_key', data: 'f'.repeat(32) }]).body }), 400],
      ['two photos', post(request, baseURL!, { token, body: multipart([{ name: 'photo', filename: 'a.jpg', data: files.jpeg.buffer }, { name: 'photo', filename: 'b.jpg', data: files.jpeg.buffer }]).body }), 400],
      ['text instead of a file', post(request, baseURL!, { token, body: multipart([{ name: 'photo', data: 'not a file' }]).body }), 400],
      ['SVG', post(request, baseURL!, { token, body: multipart([{ name: 'photo', filename: 'a.jpg', type: 'image/jpeg', data: files.svg.buffer }]).body }), 422],
    ]
    for (const [label, response, status] of cases) {
      const r = await response
      expect(r.status(), label).toBe(status)
      expect(r.headers()['cache-control'], label).toContain('no-store')
    }
    expect(await itemRow('Dessert Test 1')).toEqual(before)
    expect(mediaFiles()).toEqual(filesBefore)
  })

  test('stops reading a chunked body (no Content-Length) once it exceeds the limit', async ({ baseURL }) => {
    const big = multipart([{ name: 'photo', filename: 'big.jpg', type: 'image/jpeg', data: Buffer.alloc(10 * 1024 * 1024 + 100 * 1024, 1) }])
    const filesBefore = mediaFiles()
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(`${baseURL}/api/admin/menu/${itemId}/photo`, {
        method: 'POST',
        headers: { 'content-type': big.contentType, origin: baseURL!, cookie: `${SESSION_COOKIE}=${token}`, 'transfer-encoding': 'chunked' },
      }, (res) => {
        res.resume()
        resolve(res.statusCode!)
      })
      req.on('error', reject)
      for (let offset = 0; offset < big.body.length; offset += 256 * 1024) req.write(big.body.subarray(offset, offset + 256 * 1024))
      req.end()
    })
    expect(status).toBe(413)
    expect(mediaFiles()).toEqual(filesBefore)
  })

  test('only POST is accepted', async ({ request }) => {
    for (const method of ['GET', 'PUT', 'DELETE'] as const) {
      const response = await request.fetch(`/api/admin/menu/${itemId}/photo`, { method, headers: { cookie: `${SESSION_COOKIE}=${token}` } })
      expect(response.status(), method).toBe(405)
    }
  })

  test('Server Actions keep the default 1 MB body limit', async ({ page, baseURL }) => {
    await login(page)
    await page.goto('/admin/menu/new')
    await page.getByLabel('Catégorie').selectOption('desserts')
    await page.getByLabel('Nom').fill('Dessert Trop Lourd')
    await page.getByLabel('Prix (€)').fill('6')
    const action = await captureAction(page, () => page.getByRole('button', { name: 'Enregistrer' }).click())
    const body = appendActionField(action, 'padding', 'x'.repeat(2 * 1024 * 1024))
    const response = await replayAction(action, { baseURL: baseURL!, token: await sessionToken(page.context()), body })
    expect(response.ok()).toBe(false)
    await response.dispose()
    expect(await itemRow('Dessert Trop Lourd')).toBeUndefined()
  })
})

test('media URLs only serve server-generated variant names', async ({ request }) => {
  const { image_key: key } = await itemRow(NAME)
  for (const url of [
    '/media/menu/..%2F..%2F..%2Fpackage.json',
    '/media/menu/%2e%2e%2f%2e%2e%2f.env.local',
    `/media/menu/${key}-160.webp%00.png`,
    `/media/menu/${key}-640.webp`,
    `/media/menu/${key!.toUpperCase()}-160.webp`,
    `/media/menu/${'0'.repeat(32)}-160.webp`,
    '/media/menu/logo.svg',
    '/media/menu',
  ]) {
    const response = await request.get(url)
    expect(response.status(), url).toBe(404)
    expect(await response.text(), url).not.toContain('"name"')
  }
})

test('removes the photo: files deleted, URL gone, audited, nothing on /carte', async ({ page, request }) => {
  await login(page)
  const before = await itemRow(NAME)
  await page.goto(`/admin/menu/${before.id}`)
  await expect(page.getByRole('img', { name: `Photo actuelle de ${NAME}` })).toBeVisible()
  await page.getByRole('button', { name: 'Supprimer la photo' }).click()
  await expect(page.getByRole('heading', { name: 'Photo actuelle' })).toHaveCount(0)
  await expect(page.getByLabel('Photo (facultatif)')).toBeVisible()
  expect((await itemRow(NAME)).image_key).toBeNull()
  expect(mediaFiles()).not.toContain(variantsOf(before.image_key!)[0])
  expect((await request.get(`/media/menu/${before.image_key}-320.webp`)).status()).toBe(404)
  expect((await auditActions(before.id)).at(-1)).toBe('menu_item.photo_delete')
  await page.goto('/carte')
  await expect(page.locator('.menu-items li').filter({ hasText: NAME }).locator('img')).toHaveCount(0)
})

test('deleting an item deletes its photo files', async ({ page }) => {
  await login(page)
  const { id, image_key: key } = await itemRow('Pizza Test 3')
  await page.goto(`/admin/menu/${id}`)
  await page.getByLabel('Je confirme la suppression').check()
  await page.getByRole('button', { name: 'Supprimer définitivement' }).click()
  await expect(page).toHaveURL(/\/admin$/)
  expect(mediaFiles()).not.toContain(variantsOf(key!)[0])
  expect(mediaFiles()).not.toContain(variantsOf(key!)[1])
})

test('orphan files left by an interrupted upload are cleaned after the next upload', async ({ page }) => {
  const orphan = 'f'.repeat(32)
  const old = new Date(Date.now() - 2 * 3600_000)
  fs.mkdirSync(MENU_DIR, { recursive: true })
  for (const file of variantsOf(orphan)) {
    fs.writeFileSync(path.join(MENU_DIR, file), 'orphan')
    fs.utimesSync(path.join(MENU_DIR, file), old, old)
  }
  await login(page)
  await editPhoto(page, NAME, files.png)
  await expect(page).toHaveURL(/\/admin$/)
  const { image_key: key } = await itemRow(NAME)
  // Only the current photo of this item remains (Pizza Test 3 was deleted above).
  expect(mediaFiles()).toEqual(variantsOf(key!))
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

  test('replaces a photo from the edit form without horizontal scrolling', async ({ page }) => {
    await login(page)
    const before = await itemRow(NAME)
    await page.goto(`/admin/menu/${before.id}`)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
    await page.getByLabel('Remplacer la photo (facultatif)').setInputFiles(files.jpeg)
    await page.getByRole('button', { name: 'Enregistrer' }).tap()
    await expect(page).toHaveURL(/\/admin$/)
    expect((await itemRow(NAME)).image_key).not.toBe(before.image_key)
    await page.goto('/carte')
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
    await expect(page.locator('.menu-items li').filter({ hasText: NAME }).locator('img.menu-thumb')).toBeVisible()
  })
})
