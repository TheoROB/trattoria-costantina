import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import mysql from 'mysql2/promise'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../../lib/db-migrations.mts'
import { applyDescriptions, listItems, planDescriptions } from '../../lib/menu/descriptions.mts'
import { resetDatabase, testDatabaseUrl } from './db-helpers'

const url = testDatabaseUrl()
let conn: mysql.Connection
let ids: Record<string, number>

// Every column but description and updated_at, which must stay as they are.
async function snapshot() {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT id, category_key, name, price_cents, image_key, image_alt, is_available, is_visible, position, created_at
       FROM menu_items ORDER BY id`,
  )
  return rows
}

async function description(name: string) {
  const [rows] = await conn.query<mysql.RowDataPacket[]>('SELECT description FROM menu_items WHERE name = ?', [name])
  return rows[0].description as string | null
}

function entry(name: string, description: string, overrides: Record<string, unknown> = {}) {
  const prices: Record<string, number> = { Margherita: 1000, Marinara: 900, Diavola: 1500, Tiramisu: 800 }
  return { id: ids[name], name, currentPrice: prices[name], description, source: 'test', confidence: 'high', ...overrides }
}

function cli(...args: string[]) {
  try {
    const stdout = execFileSync(process.execPath, ['scripts/menu-descriptions.mts', ...args], {
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
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'descriptions-')), 'mapping.json')
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
  await conn.query(`INSERT INTO menu_items (category_key, name, description, price_cents, position) VALUES
    ('pizzas', 'Margherita', NULL, 1000, 0), ('pizzas', 'Marinara', '  ', 900, 1),
    ('pizzas', 'Diavola', 'Spianata piccante', 1500, 2), ('desserts', 'Tiramisu', NULL, 800, 0)`)
  const [rows] = await conn.query<mysql.RowDataPacket[]>('SELECT id, name FROM menu_items')
  ids = Object.fromEntries(rows.map((r) => [r.name, r.id]))
})
afterAll(async () => conn?.end())

describe('menu descriptions import', () => {
  it('fills empty descriptions only, leaves every other column alone and audits each change', async () => {
    const before = await snapshot()
    const result = await applyDescriptions(conn, [
      entry('Margherita', 'Sauce tomate, mozzarella fior di latte, basilic'),
      entry('Marinara', 'Sauce tomate, ail confit'),
    ])
    expect(result.updated.map((u) => u.name)).toEqual(['Margherita', 'Marinara'])
    expect(await description('Margherita')).toBe('Sauce tomate, mozzarella fior di latte, basilic')
    expect(await description('Marinara')).toBe('Sauce tomate, ail confit')
    expect(await description('Tiramisu')).toBeNull()
    expect(await snapshot()).toEqual(before)
    const [audit] = await conn.query<mysql.RowDataPacket[]>('SELECT admin_user_id, action, menu_item_name FROM admin_audit_log ORDER BY menu_item_name')
    expect(audit).toEqual(['Margherita', 'Marinara'].map((name) => ({ admin_user_id: null, action: 'menu_item.describe', menu_item_name: name })))
  })

  it('never overwrites a description already set, and reports it as a conflict', async () => {
    const result = await applyDescriptions(conn, [entry('Diavola', 'Autre texte'), entry('Margherita', 'Sauce tomate')])
    expect(result.conflicts).toEqual([{ id: ids.Diavola, name: 'Diavola', current: 'Spianata piccante', proposed: 'Autre texte' }])
    expect(await description('Diavola')).toBe('Spianata piccante')
    expect(await description('Margherita')).toBe('Sauce tomate')
  })

  it('only imports high-confidence entries', async () => {
    const plan = planDescriptions([entry('Margherita', 'Sauce tomate', { confidence: 'ambiguous' })], await listItems(conn))
    expect(plan.ok).toBe(true)
    if (plan.ok) expect([plan.updates, plan.skipped]).toEqual([[], 1])
  })

  it('refuses the whole mapping when an id is unknown, a name or price does not match, or an entry is invalid', async () => {
    const items = await listItems(conn)
    const result = planDescriptions(
      [
        entry('Margherita', 'Sauce tomate', { id: 999999 }),
        entry('Margherita', 'Sauce tomate', { name: 'Margarita' }),
        entry('Margherita', 'Sauce tomate', { currentPrice: 1100 }),
        entry('Tiramisu', '   '),
        entry('Tiramisu', 'x'.repeat(401)),
        entry('Marinara', 'Sauce tomate'),
        entry('Marinara', 'Sauce tomate'),
      ],
      items,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toHaveLength(6)
    expect(planDescriptions({}, items).ok).toBe(false)

    await expect(applyDescriptions(conn, [entry('Margherita', 'Sauce tomate'), entry('Tiramisu', 'Mascarpone', { name: 'Panna cotta' })])).rejects.toThrow(/Panna cotta/)
    expect(await description('Margherita')).toBeNull()
  })

  it('rolls back every change when one update fails', async () => {
    // A trigger makes the second update fail after the first one has run.
    await conn.query(`CREATE TRIGGER fail_tiramisu BEFORE UPDATE ON menu_items FOR EACH ROW
      BEGIN IF NEW.name = 'Tiramisu' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced failure'; END IF; END`)
    try {
      await expect(applyDescriptions(conn, [entry('Margherita', 'Sauce tomate'), entry('Tiramisu', 'Mascarpone')])).rejects.toThrow(/forced failure/)
    } finally {
      await conn.query('DROP TRIGGER fail_tiramisu')
    }
    expect(await description('Margherita')).toBeNull()
    const [audit] = await conn.query<mysql.RowDataPacket[]>('SELECT COUNT(*) AS n FROM admin_audit_log')
    expect(audit[0].n).toBe(0)
  })

  it('ships a reviewed mapping that has no ids and is refused until they are filled in', async () => {
    const mapping = JSON.parse(fs.readFileSync('scripts/menu-descriptions.json', 'utf8')) as Record<string, unknown>[]
    expect(mapping).toHaveLength(21)
    expect(mapping.every((e) => e.id === null && e.confidence === 'high')).toBe(true)
    const plan = planDescriptions(mapping, await listItems(conn))
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.errors).toHaveLength(21)
  })

  it('runs from the command line: list, check without changes, then apply', async () => {
    const list = cli('list')
    expect(list.status).toBe(0)
    expect(list.output).toContain(`${ids.Margherita}\tpizzas\t1000\tempty\tMargherita`)
    expect(list.output).toContain(`${ids.Diavola}\tpizzas\t1500\tset\tDiavola`)
    expect(list.output).toMatch(/4 item\(s\), 3 without description/)

    const file = mappingFile([entry('Margherita', 'Sauce tomate'), entry('Diavola', 'Autre texte'), entry('Tiramisu', 'Mascarpone', { confidence: 'ambiguous' })])
    const check = cli('check', file)
    expect(check.status).toBe(0)
    expect(check.output).toContain(`${ids.Margherita}\tMargherita\t<- Sauce tomate`)
    expect(check.output).toContain(`CONFLICT ${ids.Diavola}\tDiavola`)
    expect(check.output).toMatch(/1 description\(s\) would be set, 1 conflict\(s\) left as is, 1 entry\(ies\) not high confidence; nothing changed/)
    expect(await description('Margherita')).toBeNull()

    expect(cli('check', mappingFile([entry('Margherita', 'Sauce tomate', { id: 999999 })])).status).toBe(1)
    expect(cli('apply').status).toBe(1)

    const apply = cli('apply', file)
    expect(apply.status).toBe(0)
    expect(apply.output).toMatch(/Set 1 description\(s\); 1 conflict\(s\) left as is/)
    expect(await description('Margherita')).toBe('Sauce tomate')
    expect(await description('Diavola')).toBe('Spianata piccante')
  }, 30_000) // Six script runs, about a second each.
})
