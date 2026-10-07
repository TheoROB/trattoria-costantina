import path from 'node:path'
import mysql from 'mysql2/promise'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../../lib/db-migrations.mts'
import { resetDatabase, testDatabaseUrl } from './db-helpers'

const url = testDatabaseUrl()
const { createPool } = await import('../../lib/db')
const menu = await import('../../lib/menu/admin')

const pool = createPool(url)
let julien: number
let theo: number

const input = (overrides: Partial<Parameters<typeof menu.createMenuItem>[2]> = {}) => ({
  categoryKey: 'pizzas' as const,
  name: 'Margherita',
  description: 'Tomate, mozzarella',
  priceCents: 1150,
  isAvailable: true,
  isVisible: true,
  ...overrides,
})

async function names(category: string) {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT name, position FROM menu_items WHERE category_key = ? ORDER BY position, id',
    [category],
  )
  return rows.map((r) => `${r.position}:${r.name}`)
}

async function audit() {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT admin_user_id, action, menu_item_id, menu_item_name FROM admin_audit_log ORDER BY id',
  )
  return rows
}

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
})
afterAll(async () => pool.end())

describe('admin menu', () => {
  it('creates items at the end of their category and audits it', async () => {
    const a = await menu.createMenuItem(pool, julien, input({ name: 'A' }))
    await menu.createMenuItem(pool, julien, input({ name: 'B' }))
    await menu.createMenuItem(pool, theo, input({ name: 'Tiramisu', categoryKey: 'desserts' }))
    expect(await names('pizzas')).toEqual(['0:A', '1:B'])
    expect(await names('desserts')).toEqual(['0:Tiramisu'])
    expect((await audit())[0]).toEqual({ admin_user_id: julien, action: 'menu_item.create', menu_item_id: a.id, menu_item_name: 'A' })
  })

  it('lists every category in canonical order, hidden items included', async () => {
    await menu.createMenuItem(pool, julien, input({ name: 'Cachée', isVisible: false }))
    const list = await menu.listAdminMenu(pool)
    expect(list.map((c) => c.key)).toEqual(['antipasti', 'pates_plats', 'pizzas', 'desserts', 'boissons'])
    expect(list[2].items).toMatchObject([{ name: 'Cachée', isVisible: false, isAvailable: true, priceCents: 1150 }])
  })

  it('updates every field and audits it; a category change moves the item to the end and renumbers', async () => {
    const a = await menu.createMenuItem(pool, julien, input({ name: 'A' }))
    await menu.createMenuItem(pool, julien, input({ name: 'B' }))
    await menu.createMenuItem(pool, julien, input({ name: 'Tiramisu', categoryKey: 'desserts' }))
    const result = await menu.updateMenuItem(pool, theo, a.id, input({
      name: 'A2', categoryKey: 'desserts', description: null, priceCents: 990, isAvailable: false, isVisible: false,
    }))
    expect(result).toBe('ok')
    expect(await menu.getAdminMenuItem(pool, a.id)).toMatchObject({
      name: 'A2', categoryKey: 'desserts', description: null, priceCents: 990, isAvailable: false, isVisible: false, position: 1,
    })
    expect(await names('pizzas')).toEqual(['0:B'])
    expect(await names('desserts')).toEqual(['0:Tiramisu', '1:A2'])
    expect((await audit()).at(-1)).toMatchObject({ admin_user_id: theo, action: 'menu_item.update', menu_item_id: a.id })
  })

  it('keeps the position when the category does not change', async () => {
    await menu.createMenuItem(pool, julien, input({ name: 'A' }))
    const b = await menu.createMenuItem(pool, julien, input({ name: 'B' }))
    await menu.createMenuItem(pool, julien, input({ name: 'C' }))
    await menu.updateMenuItem(pool, julien, b.id, input({ name: 'B2' }))
    expect(await names('pizzas')).toEqual(['0:A', '1:B2', '2:C'])
  })

  it('two admins editing successively: last write wins, no error', async () => {
    const a = await menu.createMenuItem(pool, julien, input())
    expect(await menu.updateMenuItem(pool, julien, a.id, input({ priceCents: 1200 }))).toBe('ok')
    expect(await menu.updateMenuItem(pool, theo, a.id, input({ priceCents: 1300 }))).toBe('ok')
    expect((await menu.getAdminMenuItem(pool, a.id))?.priceCents).toBe(1300)
  })

  it('deletes, renumbers the category and keeps a name snapshot in the audit log', async () => {
    await menu.createMenuItem(pool, julien, input({ name: 'A' }))
    const b = await menu.createMenuItem(pool, julien, input({ name: 'B' }))
    await menu.createMenuItem(pool, julien, input({ name: 'C' }))
    expect(await menu.deleteMenuItem(pool, theo, b.id)).toMatchObject({ status: 'ok' })
    expect(await names('pizzas')).toEqual(['0:A', '1:C'])
    expect((await audit()).at(-1)).toEqual({ admin_user_id: theo, action: 'menu_item.delete', menu_item_id: b.id, menu_item_name: 'B' })
  })

  it('reports not_found (no write, no audit) for a deleted or unknown item', async () => {
    const a = await menu.createMenuItem(pool, julien, input())
    await menu.deleteMenuItem(pool, julien, a.id)
    const before = (await audit()).length
    expect(await menu.updateMenuItem(pool, theo, a.id, input())).toBe('not_found')
    expect(await menu.deleteMenuItem(pool, theo, a.id)).toEqual({ status: 'not_found' })
    expect(await menu.setMenuItemFlag(pool, theo, a.id, 'visible', false)).toBe('not_found')
    expect(await menu.moveMenuItem(pool, theo, a.id, 'up')).toBe('not_found')
    expect(await menu.getAdminMenuItem(pool, 999999)).toBeNull()
    expect((await audit()).length).toBe(before)
  })

  it('sets availability and visibility to an explicit value (idempotent) and audits changes', async () => {
    const a = await menu.createMenuItem(pool, julien, input())
    await menu.setMenuItemFlag(pool, julien, a.id, 'available', false)
    await menu.setMenuItemFlag(pool, theo, a.id, 'available', false)
    await menu.setMenuItemFlag(pool, julien, a.id, 'visible', false)
    expect(await menu.getAdminMenuItem(pool, a.id)).toMatchObject({ isAvailable: false, isVisible: false })
    expect((await audit()).map((r) => r.action)).toEqual([
      'menu_item.create', 'menu_item.set_available', 'menu_item.set_available', 'menu_item.set_visible',
    ])
  })

  it('moves an item within its category, renumbering positions densely', async () => {
    // Legacy rows with duplicate / sparse positions.
    await pool.query(`INSERT INTO menu_items (category_key, name, price_cents, position) VALUES
      ('pizzas', 'A', 100, 5), ('pizzas', 'B', 100, 5), ('pizzas', 'C', 100, 9), ('desserts', 'D', 100, 0)`)
    const [[c]] = await pool.query<mysql.RowDataPacket[]>("SELECT id FROM menu_items WHERE name = 'C'")
    expect(await menu.moveMenuItem(pool, julien, c.id, 'up')).toBe('ok')
    expect(await names('pizzas')).toEqual(['0:A', '1:C', '2:B'])
    await menu.moveMenuItem(pool, julien, c.id, 'up')
    expect(await names('pizzas')).toEqual(['0:C', '1:A', '2:B'])
    // Already first: no-op, no audit entry.
    await menu.moveMenuItem(pool, julien, c.id, 'up')
    expect(await names('pizzas')).toEqual(['0:C', '1:A', '2:B'])
    expect(await names('desserts')).toEqual(['0:D'])
    expect((await audit()).map((r) => r.action)).toEqual(['menu_item.move', 'menu_item.move'])
  })

  it('concurrent moves in the same category never produce duplicate positions', async () => {
    const ids = []
    for (const name of ['A', 'B', 'C', 'D', 'E']) ids.push((await menu.createMenuItem(pool, julien, input({ name }))).id)
    await Promise.all([
      menu.moveMenuItem(pool, julien, ids[4], 'up'),
      menu.moveMenuItem(pool, theo, ids[0], 'down'),
      menu.moveMenuItem(pool, julien, ids[2], 'up'),
      menu.moveMenuItem(pool, theo, ids[3], 'down'),
    ])
    const positions = (await names('pizzas')).map((n) => n.split(':')[0])
    expect(positions).toEqual(['0', '1', '2', '3', '4'])
  })
})
