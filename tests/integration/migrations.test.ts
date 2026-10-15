import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import mysql from 'mysql2/promise'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../../lib/db-migrations.mts'
import { migrationsBefore, resetDatabase, testDatabaseUrl } from './db-helpers'

const MIGRATIONS_DIR = path.resolve('db/migrations')
const url = testDatabaseUrl()
let conn: mysql.Connection

beforeEach(async () => {
  await resetDatabase()
  conn ??= await mysql.createConnection(url)
})
afterAll(async () => conn?.end())

describe('runMigrations', () => {
  it('applies every migration once and records it', async () => {
    const first = await runMigrations(url, MIGRATIONS_DIR)
    expect(first.applied).toContain('0001_create_menu_items.sql')
    const second = await runMigrations(url, MIGRATIONS_DIR)
    expect(second.applied).toEqual([])
    const [rows] = await conn.query<mysql.RowDataPacket[]>('SELECT version FROM schema_migrations')
    expect(rows.map((r) => r.version)).toContain('0001_create_menu_items.sql')
  })

  it('refuses to continue when an applied migration was edited', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-'))
    fs.writeFileSync(path.join(dir, '0001_a.sql'), 'CREATE TABLE t_a (id INT PRIMARY KEY)')
    await runMigrations(url, dir)
    fs.writeFileSync(path.join(dir, '0001_a.sql'), 'CREATE TABLE t_a (id BIGINT PRIMARY KEY)')
    await expect(runMigrations(url, dir)).rejects.toThrow(/checksum/i)
  })

  it('ignores files that are not numbered .sql migrations', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-'))
    fs.writeFileSync(path.join(dir, 'README.md'), '# not a migration')
    fs.writeFileSync(path.join(dir, '0001_a.sql'), 'CREATE TABLE t_b (id INT PRIMARY KEY)')
    expect((await runMigrations(url, dir)).applied).toEqual(['0001_a.sql'])
  })
})

describe('0004_expand_menu_categories', () => {
  it('keeps the existing items, "boissons" included, and accepts the new categories', async () => {
    // Database as deployed before 0004, with items in every old category.
    await runMigrations(url, migrationsBefore('0004'))
    for (const category_key of ['antipasti', 'pates_plats', 'pizzas', 'desserts', 'boissons']) {
      await conn.query('INSERT INTO menu_items SET ?', [{ category_key, name: `Old ${category_key}`, price_cents: 500 }])
    }
    await expect(conn.query("INSERT INTO menu_items SET category_key = 'spritz', name = 'Too early', price_cents = 800")).rejects.toThrow()

    expect((await runMigrations(url, migrationsBefore('0005'))).applied).toEqual(['0004_expand_menu_categories.sql'])
    const [rows] = await conn.query<mysql.RowDataPacket[]>('SELECT category_key FROM menu_items ORDER BY id')
    expect(rows.map((r) => r.category_key)).toEqual(['antipasti', 'pates_plats', 'pizzas', 'desserts', 'boissons'])
    for (const category_key of ['spritz', 'aperitifs', 'bieres_pression', 'bieres_bouteille', 'vins', 'digestifs', 'sans_alcool']) {
      await conn.query('INSERT INTO menu_items SET ?', [{ category_key, name: `New ${category_key}`, price_cents: 500 }])
    }
    await expect(conn.query("INSERT INTO menu_items SET category_key = 'sushis', name = 'X', price_cents = 800")).rejects.toThrow()
  })
})

const CATEGORIES = [
  'antipasti', 'pates_plats', 'pizzas', 'desserts', 'spritz', 'aperitifs', 'bieres_pression', 'bieres_bouteille',
  'vins', 'digestifs', 'sans_alcool',
]

describe('0005_remove_legacy_boissons_category', () => {
  const menuRows = async () => (await conn.query<mysql.RowDataPacket[]>('SELECT * FROM menu_items ORDER BY id'))[0]
  const appliedVersions = async () => (await conn.query<mysql.RowDataPacket[]>('SELECT version FROM schema_migrations'))[0].map((r) => r.version)

  beforeEach(async () => {
    // Database as deployed with 0001 to 0004.
    await runMigrations(url, migrationsBefore('0005'))
    for (const category_key of CATEGORIES) {
      await conn.query('INSERT INTO menu_items SET ?', [{ category_key, name: `Item ${category_key}`, price_cents: 500 }])
    }
  })

  it('applies when no item is left in "boissons", without touching the items; then only the 11 categories are accepted', async () => {
    const before = await menuRows()
    expect((await runMigrations(url, MIGRATIONS_DIR)).applied).toEqual(['0005_remove_legacy_boissons_category.sql'])
    expect(await menuRows()).toEqual(before)
    for (const category_key of CATEGORIES) {
      await conn.query('INSERT INTO menu_items SET ?', [{ category_key, name: `New ${category_key}`, price_cents: 500 }])
    }
    for (const category_key of ['boissons', 'sushis', '']) {
      await expect(conn.query('INSERT INTO menu_items SET ?', [{ category_key, name: 'X', price_cents: 500 }])).rejects.toThrow(/chk_menu_items_category/)
    }
    await expect(conn.query("UPDATE menu_items SET category_key = 'boissons' WHERE category_key = 'vins'")).rejects.toThrow(/chk_menu_items_category/)
  })

  it('refuses to run while an item is still in "boissons", and changes nothing', async () => {
    await conn.query("INSERT INTO menu_items SET category_key = 'boissons', name = 'Coca', price_cents = 300")
    const before = await menuRows()

    await expect(runMigrations(url, MIGRATIONS_DIR)).rejects.toThrow(/chk_menu_items_category/)
    expect(await menuRows()).toEqual(before)
    expect(await appliedVersions()).not.toContain('0005_remove_legacy_boissons_category.sql')
    // The 0004 constraint is still in place.
    await conn.query("INSERT INTO menu_items SET category_key = 'boissons', name = 'Fanta', price_cents = 300")

    // Once the items are moved, the migration goes through.
    await conn.query("UPDATE menu_items SET category_key = 'sans_alcool' WHERE category_key = 'boissons'")
    expect((await runMigrations(url, MIGRATIONS_DIR)).applied).toEqual(['0005_remove_legacy_boissons_category.sql'])
  })
})

describe('menu_items constraints', () => {
  beforeEach(async () => {
    await runMigrations(url, MIGRATIONS_DIR)
  })

  const insert = (values: Record<string, unknown>) =>
    conn.query('INSERT INTO menu_items SET ?', [{ category_key: 'pizzas', name: 'Test', price_cents: 1000, ...values }])

  it('accepts a valid row with sensible defaults', async () => {
    await insert({})
    const [[row]] = await conn.query<mysql.RowDataPacket[]>('SELECT * FROM menu_items')
    expect(row).toMatchObject({ is_available: 1, is_visible: 1, position: 0, image_key: null, image_alt: null })
  })

  it.each([
    ['unknown category', { category_key: 'sushis' }],
    ['retired category', { category_key: 'boissons' }],
    ['zero price', { price_cents: 0 }],
    ['price above 1000€', { price_cents: 100001 }],
    ['empty name', { name: '' }],
    ['image key with a path', { image_key: '../etc/passwd' }],
    ['image key as a URL', { image_key: 'https://evil.example/x.jpg' }],
  ])('rejects %s', async (_label, values) => {
    await expect(insert(values)).rejects.toThrow()
  })
})
