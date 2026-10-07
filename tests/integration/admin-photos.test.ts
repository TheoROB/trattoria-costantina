import path from 'node:path'
import mysql from 'mysql2/promise'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../../lib/db-migrations.mts'
import { resetDatabase, testDatabaseUrl } from './db-helpers'

const url = testDatabaseUrl()
const { createPool } = await import('../../lib/db')
const menu = await import('../../lib/menu/admin')
const { allowPhotoUpload, UPLOAD_LIMIT } = await import('../../lib/media/upload-limit')
const { newImageKey } = await import('../../lib/media/storage')

const pool = createPool(url)
let julien: number
let theo: number

const input = { categoryKey: 'pizzas' as const, name: 'Margherita', description: null, priceCents: 1150, isAvailable: true, isVisible: true }

async function photoAudit() {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT admin_user_id, action, menu_item_id, menu_item_name FROM admin_audit_log WHERE action LIKE 'menu_item.photo_%' ORDER BY id",
  )
  return rows
}
async function createWithPhoto(key: string) {
  const { id } = await menu.createMenuItem(pool, julien, input)
  await menu.setMenuItemPhoto(pool, julien, id, key)
  return { id }
}
const imageKeyOf = async (id: number) => (await menu.getAdminMenuItem(pool, id))?.imageKey

beforeAll(async () => {
  await resetDatabase()
  await runMigrations(url, path.resolve('db/migrations'))
  const [a] = await pool.query<mysql.ResultSetHeader>("INSERT INTO admin_users (email, password_hash) VALUES ('julien@admin.test', 'x')")
  const [b] = await pool.query<mysql.ResultSetHeader>("INSERT INTO admin_users (email, password_hash) VALUES ('theo@admin.test', 'x')")
  julien = a.insertId
  theo = b.insertId
})
beforeEach(async () => {
  await pool.query('DELETE FROM menu_items')
  await pool.query('DELETE FROM admin_audit_log')
  await pool.query('DELETE FROM media_upload_attempts')
})
afterAll(async () => pool.end())

describe('menu item photos', () => {
  it('adds a photo to an item and audits the addition', async () => {
    const key = newImageKey()
    const { id } = await menu.createMenuItem(pool, julien, input)
    expect(await menu.setMenuItemPhoto(pool, julien, id, key)).toEqual({ status: 'ok', removedImageKey: null })
    expect(await imageKeyOf(id)).toBe(key)
    expect(await photoAudit()).toEqual([{ admin_user_id: julien, action: 'menu_item.photo_add', menu_item_id: id, menu_item_name: 'Margherita' }])
  })

  it('replaces a photo, reporting the key that is no longer referenced', async () => {
    const first = newImageKey()
    const second = newImageKey()
    const { id } = await createWithPhoto(first)
    expect(await menu.setMenuItemPhoto(pool, theo, id, second)).toEqual({ status: 'ok', removedImageKey: first })
    expect(await imageKeyOf(id)).toBe(second)
    expect(await photoAudit()).toEqual([
      { admin_user_id: julien, action: 'menu_item.photo_add', menu_item_id: id, menu_item_name: 'Margherita' },
      { admin_user_id: theo, action: 'menu_item.photo_replace', menu_item_id: id, menu_item_name: 'Margherita' },
    ])
  })

  it('keeps the current photo when the item text is updated', async () => {
    const key = newImageKey()
    const { id } = await createWithPhoto(key)
    expect(await menu.updateMenuItem(pool, julien, id, { ...input, priceCents: 1300 })).toBe('ok')
    expect(await imageKeyOf(id)).toBe(key)
  })

  it('removes a photo (audited once) and is a no-op without one', async () => {
    const key = newImageKey()
    const { id } = await createWithPhoto(key)
    expect(await menu.removeMenuItemPhoto(pool, theo, id)).toEqual({ status: 'ok', removedImageKey: key })
    expect(await imageKeyOf(id)).toBeNull()
    expect(await menu.removeMenuItemPhoto(pool, theo, id)).toEqual({ status: 'ok', removedImageKey: null })
    expect((await photoAudit()).map((r) => r.action)).toEqual(['menu_item.photo_add', 'menu_item.photo_delete'])
  })

  it('reports the photo of a deleted item so its files can be removed', async () => {
    const key = newImageKey()
    const { id } = await createWithPhoto(key)
    expect(await menu.deleteMenuItem(pool, julien, id)).toEqual({ status: 'ok', removedImageKey: key })
    expect(await menu.removeMenuItemPhoto(pool, julien, id)).toEqual({ status: 'not_found' })
    expect(await menu.setMenuItemPhoto(pool, julien, id, newImageKey())).toEqual({ status: 'not_found' })
  })

  it('serialises concurrent replacements: every replaced key is reported exactly once', async () => {
    const original = newImageKey()
    const { id } = await createWithPhoto(original)
    const keys = Array.from({ length: 5 }, newImageKey)
    const results = await Promise.all(keys.map((key, i) => menu.setMenuItemPhoto(pool, i % 2 ? julien : theo, id, key)))
    const removed = results.map((r) => (r.status === 'ok' ? r.removedImageKey : 'not_found'))
    const final = await imageKeyOf(id)
    // Every key except the final one was removed once; the final one never.
    expect(new Set(removed).size).toBe(5)
    expect([...removed, final].sort()).toEqual([original, ...keys].sort())
  })

  it('lists which keys are still referenced', async () => {
    const used = newImageKey()
    await createWithPhoto(used)
    expect(await menu.referencedImageKeys(pool, [used, newImageKey()])).toEqual(new Set([used]))
    expect(await menu.referencedImageKeys(pool, [])).toEqual(new Set())
  })

  it('refuses a key that is not a server-generated token at the database level', async () => {
    const { id } = await menu.createMenuItem(pool, julien, input)
    await expect(menu.setMenuItemPhoto(pool, julien, id, '../../etc/passwd')).rejects.toThrow(/chk_menu_items_image_key/)
  })
})

describe('photo upload limit', () => {
  it(`allows ${UPLOAD_LIMIT.max} uploads per ${UPLOAD_LIMIT.windowMinutes} minutes per account`, async () => {
    for (let i = 0; i < UPLOAD_LIMIT.max; i++) expect(await allowPhotoUpload(pool, julien)).toBe(true)
    expect(await allowPhotoUpload(pool, julien)).toBe(false)
    // The other account is not affected.
    expect(await allowPhotoUpload(pool, theo)).toBe(true)
    // Refused attempts are not recorded.
    const [[row]] = await pool.query<mysql.RowDataPacket[]>('SELECT COUNT(*) AS n FROM media_upload_attempts WHERE admin_user_id = ?', [julien])
    expect(row.n).toBe(UPLOAD_LIMIT.max)
  })

  it('allows uploads again once the window has passed, and purges rows older than 24 hours', async () => {
    for (let i = 0; i < UPLOAD_LIMIT.max; i++) await allowPhotoUpload(pool, julien)
    await pool.query('UPDATE media_upload_attempts SET created_at = created_at - INTERVAL ? MINUTE', [UPLOAD_LIMIT.windowMinutes + 1])
    expect(await allowPhotoUpload(pool, julien)).toBe(true)
    await pool.query('UPDATE media_upload_attempts SET created_at = created_at - INTERVAL 25 HOUR')
    await allowPhotoUpload(pool, theo)
    const [[row]] = await pool.query<mysql.RowDataPacket[]>('SELECT COUNT(*) AS n FROM media_upload_attempts')
    expect(row.n).toBe(1)
  })
})
