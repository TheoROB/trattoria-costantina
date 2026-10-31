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
const store = await import('../../lib/reservation-requests/store')
const { POST } = await import('../../app/api/reservation-requests/route')

const MIGRATIONS_DIR = path.resolve('db/migrations')
const pool = createPool(url)

const events = async () =>
  (await pool.query<mysql.RowDataPacket[]>('SELECT * FROM reservation_request_events ORDER BY id'))[0]
const eventCount = async () => (await events()).length
const quotaRows = async () =>
  (await pool.query<mysql.RowDataPacket[]>('SELECT window_start, hits FROM reservation_request_quota ORDER BY window_start'))[0]

async function clearMetrics() {
  for (const table of ['reservation_request_events', 'reservation_request_tracking', 'reservation_request_quota']) {
    await pool.query(`DELETE FROM ${table}`)
  }
}

afterAll(async () => {
  await pool.end()
  await closePool()
})

describe('0006_create_reservation_request_metrics', () => {
  beforeEach(async () => resetDatabase())

  it('only adds tables: existing data is untouched, and it can be run again after a partial run', async () => {
    await runMigrations(url, migrationsBefore('0006'))
    await pool.query("INSERT INTO menu_items SET category_key = 'pizzas', name = 'Margherita', price_cents = 1100")
    const [before] = await pool.query<mysql.RowDataPacket[]>('SELECT * FROM menu_items')

    expect((await runMigrations(url, MIGRATIONS_DIR)).applied).toEqual(['0006_create_reservation_request_metrics.sql'])
    expect((await pool.query<mysql.RowDataPacket[]>('SELECT * FROM menu_items'))[0]).toEqual(before)
    expect((await runMigrations(url, MIGRATIONS_DIR)).applied).toEqual([])

    // A run that stopped after the first table (MySQL DDL is not transactional) can be resumed.
    await pool.query('DROP TABLE reservation_request_quota')
    await pool.query("DELETE FROM schema_migrations WHERE version LIKE '0006%'")
    expect((await runMigrations(url, MIGRATIONS_DIR)).applied).toEqual(['0006_create_reservation_request_metrics.sql'])
  })

  it('stores nothing but a time and an allowlisted path', async () => {
    await runMigrations(url, MIGRATIONS_DIR)
    const [columns] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT table_name AS t, column_name AS c FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name LIKE 'reservation_request_%' ORDER BY table_name, ordinal_position`,
    )
    expect(columns.map((r) => `${r.t}.${r.c}`)).toEqual([
      'reservation_request_events.id',
      'reservation_request_events.occurred_at',
      'reservation_request_events.path',
      'reservation_request_quota.window_start',
      'reservation_request_quota.hits',
      'reservation_request_tracking.id',
      'reservation_request_tracking.activated_at',
    ])
    const insert = (p: string) => pool.query('INSERT INTO reservation_request_events (occurred_at, path) VALUES (UTC_TIMESTAMP(3), ?)', [p])
    for (const p of ['/', '/carte', '/mentions-legales']) await insert(p)
    for (const p of ['/admin', '/carte?x=1', '/#reservation', '', '/carte/']) {
      await expect(insert(p)).rejects.toThrow(/chk_reservation_request_events_path/)
    }
    await expect(pool.query('INSERT INTO reservation_request_tracking VALUES (2, UTC_TIMESTAMP(3))')).rejects.toThrow(/chk_reservation_request_tracking_single/)
  })
})

describe('recording', () => {
  beforeAll(async () => {
    await resetDatabase()
    await runMigrations(url, MIGRATIONS_DIR)
  })
  beforeEach(clearMetrics)

  it('records the database UTC time and the path, durably, and activates counting once', async () => {
    const before = Date.now()
    expect(await store.recordReservationRequest(pool, '/carte')).toBe('recorded')
    const [{ occurred_at: first }] = await events()
    expect(Math.abs((first as Date).getTime() - before)).toBeLessThan(5000)

    expect(await store.recordReservationRequest(pool, '/')).toBe('recorded')
    // Seen from a brand-new connection: committed, not just in a session.
    const other = await mysql.createConnection({ uri: url, timezone: 'Z' })
    const [rows] = await other.query<mysql.RowDataPacket[]>('SELECT path FROM reservation_request_events ORDER BY id')
    const [[tracking]] = await other.query<mysql.RowDataPacket[]>('SELECT activated_at FROM reservation_request_tracking')
    await other.end()
    expect(rows.map((r) => r.path)).toEqual(['/carte', '/'])
    expect((tracking.activated_at as Date).getTime()).toBe((first as Date).getTime())
    expect((await store.activationTime(pool)).getTime()).toBe((first as Date).getTime())
  })

  it('never lets concurrent requests go past the global quota, and resumes in the next hour', async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => store.recordReservationRequest(pool, '/', 10)))
    expect(results.filter((r) => r === 'recorded')).toHaveLength(10)
    expect(results.filter((r) => r === 'over_quota')).toHaveLength(15)
    expect(await eventCount()).toBe(10)
    expect((await quotaRows()).map((r) => r.hits)).toEqual([10])

    // Same window from another pool (another Node process): still refused.
    const otherPool = createPool(url)
    expect(await store.recordReservationRequest(otherPool, '/', 10)).toBe('over_quota')
    await otherPool.end()

    // Pretend the hour is over.
    await pool.query('UPDATE reservation_request_quota SET window_start = window_start - INTERVAL 1 HOUR')
    expect(await store.recordReservationRequest(pool, '/', 10)).toBe('recorded')
    expect(await eventCount()).toBe(11)
  })

  it('purges quota windows older than two days', async () => {
    await pool.query("INSERT INTO reservation_request_quota VALUES (UTC_TIMESTAMP() - INTERVAL 3 DAY, 5), (UTC_TIMESTAMP() - INTERVAL 1 DAY, 5)")
    await store.recordReservationRequest(pool, '/')
    expect(await quotaRows()).toHaveLength(2)
  })

  it('keeps the first activation time, whether set by the report or by an event', async () => {
    const activated = await store.activationTime(pool)
    await new Promise((r) => setTimeout(r, 20))
    await store.recordReservationRequest(pool, '/')
    expect((await store.activationTime(pool)).getTime()).toBe(activated.getTime())
  })
})

describe('loadMonthReport', () => {
  beforeAll(async () => {
    await resetDatabase()
    await runMigrations(url, MIGRATIONS_DIR)
  })
  beforeEach(clearMetrics)

  const seed = async (activatedAt: string, times: string[]) => {
    await pool.query('INSERT INTO reservation_request_tracking VALUES (1, ?)', [new Date(activatedAt)])
    for (const t of times) await pool.query("INSERT INTO reservation_request_events (occurred_at, path) VALUES (?, '/')", [new Date(t)])
  }

  it('groups stored UTC times into Paris days and weeks across the October DST change', async () => {
    await seed('2026-10-20T08:00:00Z', [
      '2026-10-24T21:59:59.999Z', // Sat 24, 23:59 CEST
      '2026-10-24T22:00:00Z', // Sun 25, 00:00 CEST
      '2026-10-25T00:30:00Z', // Sun 25, 02:30 CEST
      '2026-10-25T01:30:00Z', // Sun 25, 02:30 CET
      '2026-10-25T22:59:00Z', // Sun 25, 23:59 CET
      '2026-10-25T23:00:00Z', // Mon 26, 00:00 CET
      '2026-11-01T22:59:00Z', // Sun 1 Nov, 23:59 CET: same week as Mon 26 Oct
      '2026-10-19T21:00:00Z', // Mon 19, 23:00 CEST: a day before activation, stays unavailable
    ])
    const { report, activatedAt } = await store.loadMonthReport(pool, '2026-10', new Date('2026-11-05T12:00:00Z'))
    expect(activatedAt.toISOString()).toBe('2026-10-20T08:00:00.000Z')
    const day = (d: string) => report.days.find((x) => x.date === d)
    expect(day('2026-10-19')).toMatchObject({ status: 'unavailable', count: null })
    expect(day('2026-10-20')).toMatchObject({ status: 'observed', count: 0, partial: true })
    expect(day('2026-10-24')).toMatchObject({ status: 'observed', count: 1 })
    expect(day('2026-10-25')).toMatchObject({ status: 'observed', count: 4 })
    expect(day('2026-10-26')).toMatchObject({ status: 'observed', count: 1 })
    expect(report.weeks.find((w) => w.start === '2026-10-19')).toMatchObject({ count: 5, partial: true })
    expect(report.weeks.find((w) => w.start === '2026-10-26')).toMatchObject({ count: 2, partial: false })
    expect(report).toMatchObject({ count: 6, previous: null, next: '2026-11' })
  })

  it('ignores an out-of-range or malformed month', async () => {
    await seed('2026-10-20T08:00:00Z', [])
    const now = new Date('2026-11-05T12:00:00Z')
    expect((await store.loadMonthReport(pool, '2020-01', now)).report.month).toBe('2026-10')
    expect((await store.loadMonthReport(pool, '2030-01', now)).report.month).toBe('2026-11')
    expect((await store.loadMonthReport(pool, "2026-10' OR 1=1", now)).report.month).toBe('2026-11')
  })

  it('activates counting on the first look at the report, with nothing before', async () => {
    const { report, activatedAt } = await store.loadMonthReport(pool, undefined)
    expect(Math.abs(activatedAt.getTime() - Date.now())).toBeLessThan(5000)
    expect(report.days.filter((d) => d.status === 'observed')).toHaveLength(1)
  })
})

describe('POST /api/reservation-requests', () => {
  beforeAll(async () => {
    await resetDatabase()
    await runMigrations(url, MIGRATIONS_DIR)
  })
  beforeEach(clearMetrics)

  const post = (body: BodyInit, headers: Record<string, string> = {}) =>
    POST(new Request(`${ORIGIN}/api/reservation-requests`, {
      method: 'POST',
      body,
      headers: { origin: ORIGIN, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
    }))

  it('records an allowlisted path and answers 204 without caching', async () => {
    const res = await post('{"path":"/mentions-legales"}', { cookie: 'tc_admin=secret', 'x-forwarded-for': '203.0.113.9' })
    expect(res.status).toBe(204)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('set-cookie')).toBeNull()
    const rows = await events()
    expect(rows.map((r) => r.path)).toEqual(['/mentions-legales'])
    expect(JSON.stringify(rows)).not.toMatch(/203\.0\.113\.9|secret/)
  })

  it.each([
    ['another origin', '{"path":"/"}', { origin: 'https://evil.example' }, 403],
    ['a cross-site fetch', '{"path":"/"}', { 'sec-fetch-site': 'cross-site' }, 403],
    ['a form post', 'path=/', { 'content-type': 'application/x-www-form-urlencoded' }, 415],
    ['a large body', JSON.stringify({ path: '/', pad: 'x'.repeat(200) }), {}, 413],
    ['a query string', '{"path":"/carte?utm_source=x"}', {}, 400],
    ['a hash', '{"path":"/#reservation"}', {}, 400],
    ['an unknown page', '{"path":"/admin"}', {}, 400],
    ['extra data', '{"path":"/","id":"abc"}', {}, 400],
    ['invalid JSON', '{', {}, 400],
  ])('refuses %s', async (_label, body, headers, status) => {
    expect((await post(body, headers)).status).toBe(status)
    expect(await eventCount()).toBe(0)
  })

  it('refuses a request without Origin', async () => {
    const res = await POST(new Request(`${ORIGIN}/api/reservation-requests`, {
      method: 'POST', body: '{"path":"/"}', headers: { 'content-type': 'application/json' },
    }))
    expect(res.status).toBe(403)
  })

  it('answers 429 once the hourly quota is used, without recording', async () => {
    await pool.query('INSERT INTO reservation_request_quota VALUES (?, ?)', [
      new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000), store.HOURLY_QUOTA,
    ])
    expect((await post('{"path":"/"}')).status).toBe(429)
    expect(await eventCount()).toBe(0)
  })
})
