import path from 'node:path'
import mysql from 'mysql2/promise'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../../lib/db-migrations.mts'
import { migrationsBefore, resetDatabase, testDatabaseUrl } from './db-helpers'

const url = testDatabaseUrl()
const ORIGIN = 'http://localhost:3999'
// The route handler reads its configuration from the environment, like in production.
process.env.DATABASE_URL = url
process.env.APP_ORIGIN = ORIGIN

const { createPool, closePool } = await import('../../lib/db')
const store = await import('../../lib/site-reservations/store')
const { POST } = await import('../../app/api/site-reservations/route')

const MIGRATIONS_DIR = path.resolve('db/migrations')
const pool = createPool(url)
const NOW = new Date('2026-11-04T12:00:00Z')
const TOMORROW = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
const valid = { date: TOMORROW, time: '19:45', covers: 4 }

const rows = async () => (await pool.query<mysql.RowDataPacket[]>('SELECT * FROM site_reservations ORDER BY id'))[0]
const insert = (meal_date: string, meal_time: string, covers: number, received_at = NOW) =>
  pool.query('INSERT INTO site_reservations SET ?', [{ meal_date, meal_time, covers, received_at }])

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request(`${ORIGIN}/api/site-reservations`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))

afterAll(async () => {
  await pool.end()
  await closePool()
})

describe('0006_create_site_reservations', () => {
  beforeEach(async () => resetDatabase())

  it('only adds tables: existing data is untouched, and it can be run again after a partial run', async () => {
    await runMigrations(url, migrationsBefore('0006'))
    await pool.query("INSERT INTO menu_items SET category_key = 'pizzas', name = 'Margherita', price_cents = 1100")
    expect((await runMigrations(url, MIGRATIONS_DIR)).applied).toEqual(['0006_create_site_reservations.sql'])
    const [menu] = await pool.query<mysql.RowDataPacket[]>('SELECT name FROM menu_items')
    expect(menu.map((m) => m.name)).toEqual(['Margherita'])

    await pool.query("DELETE FROM schema_migrations WHERE version = '0006_create_site_reservations.sql'")
    expect((await runMigrations(url, MIGRATIONS_DIR)).applied).toEqual(['0006_create_site_reservations.sql'])
  })

  it('has no column able to hold anything about the customer', async () => {
    await runMigrations(url, MIGRATIONS_DIR)
    const [columns] = await pool.query<mysql.RowDataPacket[]>('SHOW COLUMNS FROM site_reservations')
    expect(columns.map((c) => c.Field)).toEqual(['id', 'received_at', 'meal_date', 'meal_time', 'covers'])
  })
})

describe('with the schema', () => {
  beforeAll(async () => {
    await resetDatabase()
    await runMigrations(url, MIGRATIONS_DIR)
  })
  beforeEach(async () => {
    await pool.query('DELETE FROM site_reservations')
    await pool.query('DELETE FROM site_reservation_quota')
  })

  describe('POST /api/site-reservations', () => {
    it('records a valid reservation with the server time', async () => {
      const before = Date.now()
      const response = await post(valid)
      expect(response.status).toBe(204)
      expect(response.headers.get('cache-control')).toBe('no-store')
      const [row] = await rows()
      expect(row.covers).toBe(4)
      expect(row.meal_time).toBe('19:45:00')
      expect(Math.abs((row.received_at as Date).getTime() - before)).toBeLessThan(60_000)
    })

    it.each([
      ['another origin', valid, { origin: 'https://evil.example' }, 403],
      ['no origin', valid, { origin: '' }, 403],
      ['a cross-site fetch', valid, { 'sec-fetch-site': 'cross-site' }, 403],
      ['another content type', valid, { 'content-type': 'text/plain' }, 415],
      ['an oversized body', { ...valid, pad: 'x'.repeat(200) }, {}, 413],
      ['invalid JSON', '{', {}, 400],
      ['an extra field', { ...valid, email: 'a@b.c' }, {}, 400],
      ['too many covers', { ...valid, covers: 101 }, {}, 400],
      ['a meal long past', { ...valid, date: '2020-01-01' }, {}, 400],
    ])('refuses %s', async (_, body, headers, status) => {
      expect((await post(body, headers)).status).toBe(status)
      expect(await rows()).toHaveLength(0)
    })

    it('refuses without APP_ORIGIN', async () => {
      delete process.env.APP_ORIGIN
      try {
        expect((await post(valid)).status).toBe(500)
      } finally {
        process.env.APP_ORIGIN = ORIGIN
      }
      expect(await rows()).toHaveLength(0)
    })
  })

  describe('quota', () => {
    it('never goes past the cap under concurrency, counting the accepted ones exactly', async () => {
      const results = await Promise.all(Array.from({ length: 12 }, () => store.recordSiteReservation(pool, valid, 5)))
      expect(results.filter((r) => r === 'recorded')).toHaveLength(5)
      expect(results.filter((r) => r === 'over_quota')).toHaveLength(7)
      expect(await rows()).toHaveLength(5)
    })

    it('answers 429 once the hourly quota is used', async () => {
      const now = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000)
      await pool.query('INSERT INTO site_reservation_quota SET ?', [{ window_start: now, hits: store.HOURLY_QUOTA }])
      expect((await post(valid)).status).toBe(429)
      expect(await rows()).toHaveLength(0)
    })

    it('purges old quota windows when a new one opens', async () => {
      await pool.query('INSERT INTO site_reservation_quota SET ?', [{ window_start: new Date('2020-01-01T00:00:00Z'), hits: 3 }])
      await store.recordSiteReservation(pool, valid)
      const [left] = await pool.query<mysql.RowDataPacket[]>('SELECT COUNT(*) AS n FROM site_reservation_quota')
      expect(left[0].n).toBe(1)
    })
  })

  describe('loadMonth', () => {
    it('lists one meal month in order, with its totals', async () => {
      await insert('2026-11-20', '20:05', 4)
      await insert('2026-11-06', '19:15', 2)
      await insert('2026-11-06', '12:00', 3)
      await insert('2026-12-01', '12:00', 6)
      const report = await store.loadMonth(pool, undefined, NOW)
      expect(report.month).toBe('2026-11')
      expect(report.reservations.map((r) => [r.date, r.time, r.covers])).toEqual([
        ['2026-11-06', '12:00', 3], ['2026-11-06', '19:15', 2], ['2026-11-20', '20:05', 4],
      ])
      expect(report.totalCovers).toBe(9)
      expect(report.previous).toBeNull()
      expect(report.next).toBe('2026-12')
    })

    it('includes the first and last day of the month, and returns UTC reception times', async () => {
      await insert('2026-11-01', '12:00', 1, new Date('2026-10-30T10:00:00.123Z'))
      await insert('2026-11-30', '12:00', 1)
      await insert('2026-10-31', '12:00', 1)
      await insert('2026-12-01', '12:00', 1)
      const { reservations } = await store.loadMonth(pool, '2026-11', NOW)
      expect(reservations.map((r) => r.date)).toEqual(['2026-11-01', '2026-11-30'])
      expect(reservations[0].receivedAt.toISOString()).toBe('2026-10-30T10:00:00.123Z')
    })

    it('stays on the current month with no data, and clamps other months', async () => {
      expect(await store.loadMonth(pool, '2030-01', NOW)).toMatchObject({ month: '2026-11', reservations: [], totalCovers: 0, previous: null, next: null })
      await insert('2026-09-10', '12:00', 2)
      expect(await store.loadMonth(pool, '2020-01', NOW)).toMatchObject({ month: '2026-09', previous: null, next: '2026-10' })
      expect(await store.loadMonth(pool, "2026-09' OR 1=1", NOW)).toMatchObject({ month: '2026-11', previous: '2026-10', next: null })
    })
  })
})
