import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import mysql from 'mysql2/promise'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../../lib/db-migrations.mts'
import { resetDatabase, testDatabaseUrl } from './db-helpers'

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
    ['zero price', { price_cents: 0 }],
    ['price above 1000€', { price_cents: 100001 }],
    ['empty name', { name: '' }],
    ['image key with a path', { image_key: '../etc/passwd' }],
    ['image key as a URL', { image_key: 'https://evil.example/x.jpg' }],
  ])('rejects %s', async (_label, values) => {
    await expect(insert(values)).rejects.toThrow()
  })
})
