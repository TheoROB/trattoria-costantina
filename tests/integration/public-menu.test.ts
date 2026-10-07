import path from 'node:path'
import mysql from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from '../../lib/db-migrations.mts'
import { resetDatabase, testDatabaseUrl } from './db-helpers'

const url = testDatabaseUrl()
process.env.DATABASE_URL = url
const { getPublicMenu, readPublicMenu } = await import('../../lib/menu/queries')
const { createPool, closePool } = await import('../../lib/db')

beforeAll(async () => {
  await resetDatabase()
  await runMigrations(url, path.resolve('db/migrations'))
  const conn = await mysql.createConnection(url)
  const rows = [
    // [category, name, price, available, visible, position]
    ['pizzas', 'Pizza B', 1200, 1, 1, 2],
    ['pizzas', 'Pizza A', 1100, 1, 1, 1],
    ['pizzas', 'Pizza hidden', 900, 1, 0, 0],
    ['pizzas', 'Pizza sold out', 1300, 0, 1, 3],
    ['antipasti', 'Antipasto', 800, 1, 1, 0],
    ['boissons', 'Boisson', 300, 1, 1, 0],
  ]
  for (const [category_key, name, price_cents, is_available, is_visible, position] of rows) {
    await conn.query('INSERT INTO menu_items SET ?', [
      { category_key, name, price_cents, is_available, is_visible, position, description: `Desc ${name}` },
    ])
  }
  await conn.end()
})
afterAll(async () => closePool())

describe('getPublicMenu', () => {
  it('returns visible items grouped by category, in category then position order', async () => {
    const menu = await getPublicMenu()
    expect(menu.status).toBe('ok')
    if (menu.status !== 'ok') return
    expect(menu.categories.map((c) => c.key)).toEqual(['antipasti', 'pizzas', 'boissons'])
    expect(menu.categories[1].items.map((i) => i.name)).toEqual(['Pizza A', 'Pizza B', 'Pizza sold out'])
  })

  it('never exposes hidden items', async () => {
    const menu = await getPublicMenu()
    expect(JSON.stringify(menu)).not.toContain('Pizza hidden')
  })

  it('flags unavailable items and exposes only public fields', async () => {
    const menu = await getPublicMenu()
    if (menu.status !== 'ok') throw new Error('expected ok')
    const soldOut = menu.categories[1].items.find((i) => i.name === 'Pizza sold out')
    expect(soldOut).toEqual({
      id: expect.any(Number),
      categoryKey: 'pizzas',
      name: 'Pizza sold out',
      description: 'Desc Pizza sold out',
      priceCents: 1300,
      imageKey: null,
      isAvailable: false,
    })
  })
})

describe('readPublicMenu when the database is unreachable', () => {
  it('reports the menu as unavailable instead of throwing', async () => {
    const pool = createPool('mysql://nobody:wrong@127.0.0.1:1/nothing')
    expect(await readPublicMenu(pool)).toEqual({ status: 'unavailable' })
    await pool.end()
  })
})
