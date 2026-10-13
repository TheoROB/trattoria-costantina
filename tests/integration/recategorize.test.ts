import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import mysql from 'mysql2/promise'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../../lib/db-migrations.mts'
import { applyRecategorization, listLegacyItems, parseRecategorization } from '../../lib/menu/recategorize.mts'
import { resetDatabase, testDatabaseUrl } from './db-helpers'

const url = testDatabaseUrl()
let conn: mysql.Connection
let ids: Record<string, number>

async function names(category: string) {
  const [rows] = await conn.query<mysql.RowDataPacket[]>('SELECT name, position FROM menu_items WHERE category_key = ? ORDER BY position, id', [category])
  return rows.map((r) => `${r.position}:${r.name}`)
}

function cli(...args: string[]) {
  try {
    const stdout = execFileSync(process.execPath, ['scripts/menu-recategorize.mts', ...args], {
      env: { PATH: process.env.PATH, DATABASE_URL: url, NODE_ENV: 'test' },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, output: stdout }
  } catch (error) {
    const { status, stdout, stderr } = error as { status: number; stdout: string; stderr: string }
    return { status, output: stdout + stderr }
  }
}

function mappingFile(mapping: unknown) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'recategorize-')), 'mapping.json')
  fs.writeFileSync(file, JSON.stringify(mapping))
  return file
}

beforeAll(async () => {
  await resetDatabase()
  await runMigrations(url, path.resolve('db/migrations'))
  conn = await mysql.createConnection(url)
})
beforeEach(async () => {
  await conn.query('DELETE FROM menu_items')
  await conn.query('DELETE FROM admin_audit_log')
  await conn.query(`INSERT INTO menu_items (category_key, name, price_cents, position) VALUES
    ('vins', 'Lambrusco', 2200, 0),
    ('boissons', 'Aperol Spritz', 800, 0), ('boissons', 'Coca', 300, 1), ('boissons', 'Chianti', 2400, 2),
    ('boissons', 'Limoncello', 600, 3)`)
  const [rows] = await conn.query<mysql.RowDataPacket[]>('SELECT id, name FROM menu_items')
  ids = Object.fromEntries(rows.map((r) => [r.name, r.id]))
})
afterAll(async () => conn?.end())

describe('recategorization of retired categories', () => {
  it('lists only the items of retired categories, in their order', async () => {
    expect((await listLegacyItems(conn)).map((i) => i.name)).toEqual(['Aperol Spritz', 'Coca', 'Chianti', 'Limoncello'])
  })

  it('rejects mappings naming unknown categories, retired categories or items that are not to be moved', async () => {
    const items = await listLegacyItems(conn)
    expect(parseRecategorization([], items).ok).toBe(false)
    expect(parseRecategorization({}, items).ok).toBe(false)
    const result = parseRecategorization(
      { [ids.Coca]: 'boissons', [ids.Chianti]: 'sushis', [ids.Lambrusco]: 'vins', '999999': 'vins', abc: 'vins' },
      items,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toHaveLength(5)
  })

  it('moves the mapped items to the end of their new category, renumbers the rest and audits each move', async () => {
    const parsed = parseRecategorization({ [ids['Aperol Spritz']]: 'spritz', [ids.Chianti]: 'vins', [ids.Coca]: 'sans_alcool' }, await listLegacyItems(conn))
    if (!parsed.ok) throw new Error(parsed.errors.join())
    await applyRecategorization(conn, parsed.plan)

    expect(await names('spritz')).toEqual(['0:Aperol Spritz'])
    expect(await names('vins')).toEqual(['0:Lambrusco', '1:Chianti'])
    expect(await names('sans_alcool')).toEqual(['0:Coca'])
    // Not in the mapping: stays, renumbered.
    expect(await names('boissons')).toEqual(['0:Limoncello'])
    const [audit] = await conn.query<mysql.RowDataPacket[]>('SELECT admin_user_id, action, menu_item_name FROM admin_audit_log ORDER BY menu_item_name')
    expect(audit).toEqual(['Aperol Spritz', 'Chianti', 'Coca'].map((name) => ({ admin_user_id: null, action: 'menu_item.recategorize', menu_item_name: name })))
  })

  it('changes nothing when an item was moved in the meantime', async () => {
    const parsed = parseRecategorization({ [ids.Coca]: 'sans_alcool', [ids.Chianti]: 'vins' }, await listLegacyItems(conn))
    if (!parsed.ok) throw new Error(parsed.errors.join())
    await conn.query("UPDATE menu_items SET category_key = 'vins' WHERE id = ?", [ids.Chianti])
    await expect(applyRecategorization(conn, parsed.plan)).rejects.toThrow(/No longer in a retired category/)
    expect(await names('sans_alcool')).toEqual([])
    expect((await names('boissons')).map((n) => n.split(':')[1])).toEqual(['Aperol Spritz', 'Coca', 'Limoncello'])
  })

  it('runs from the command line: list, check without changes, then apply', async () => {
    const list = cli('list')
    expect(list.status).toBe(0)
    expect(list.output).toContain(`${ids.Coca}\tboissons\tCoca`)
    expect(list.output).toContain('sans_alcool')

    const file = mappingFile({ [ids.Coca]: 'sans_alcool', [ids.Limoncello]: 'digestifs' })
    const check = cli('check', file)
    expect(check.status).toBe(0)
    expect(check.output).toMatch(/2 item\(s\) would move; nothing changed/)

    expect(await names('sans_alcool')).toEqual([])
    expect(cli('check', mappingFile({ [ids.Coca]: 'sodas' })).status).toBe(1)
    expect(cli('apply').status).toBe(1)

    const apply = cli('apply', file)
    expect(apply.status).toBe(0)
    expect(apply.output).toMatch(/Moved 2 item\(s\); 2 left in a retired category/)
    expect(await names('sans_alcool')).toEqual(['0:Coca'])
    expect(await names('digestifs')).toEqual(['0:Limoncello'])
    expect(await names('boissons')).toEqual(['0:Aperol Spritz', '1:Chianti'])
  })
})
