import 'server-only'
import type mysql from 'mysql2/promise'
import type { TrackedPath } from './paths'
import {
  buildMonthReport, buildSummary, countsByParisDay, monthBounds, monthQueryRange, resolveMonth, summaryQueryRange,
} from './report'

// Site-wide cap per UTC hour, shared by every Node process through the database (no per-visitor key exists).
// Far above a restaurant's real traffic; bounds the table to ~1.8 million rows a year in the worst case.
export const HOURLY_QUOTA = 200

// InnoDB may pick a concurrent upsert of the same new quota row as a deadlock victim: the transaction is rolled
// back as a whole, so trying again is safe and never counts twice.
const RETRYABLE = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'])
export const RECORD_ATTEMPTS = 3

type Pool = Pick<mysql.Pool, 'getConnection' | 'query'>

// Records one opening with the database's own UTC time. The quota row stays locked until commit/rollback, so
// concurrent requests (from any process) can never go past the cap; the event and its quota hit commit together.
export async function recordReservationRequest(pool: Pool, path: TrackedPath, quota = HOURLY_QUOTA) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await recordOnce(pool, path, quota)
    } catch (error) {
      if (attempt >= RECORD_ATTEMPTS || !RETRYABLE.has((error as { code?: string }).code ?? '')) throw error
    }
  }
}

async function recordOnce(pool: Pool, path: TrackedPath, quota: number) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [[{ now }]] = await conn.query<mysql.RowDataPacket[]>('SELECT UTC_TIMESTAMP(3) AS now')
    const window = new Date(Math.floor((now as Date).getTime() / 3_600_000) * 3_600_000)
    // The upsert takes the row's exclusive lock straight away (a shared lock then FOR UPDATE would deadlock under
    // concurrency); an over-quota hit is undone by the rollback.
    await conn.query(
      'INSERT INTO reservation_request_quota (window_start, hits) VALUES (?, 1) ON DUPLICATE KEY UPDATE hits = hits + 1',
      [window],
    )
    const [[{ hits }]] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT hits FROM reservation_request_quota WHERE window_start = ?',
      [window],
    )
    if (Number(hits) > quota) {
      await conn.rollback()
      return 'over_quota' as const
    }
    await conn.query('INSERT INTO reservation_request_events (occurred_at, path) VALUES (?, ?)', [now, path])
    await conn.query('INSERT IGNORE INTO reservation_request_tracking (id, activated_at) VALUES (1, ?)', [now])
    await conn.commit()
    // Housekeeping once per hour (by the request that opened the window), after the commit: the event is already
    // stored, so a failure here must not turn into an error for the visitor.
    if (Number(hits) === 1) {
      await conn.query('DELETE FROM reservation_request_quota WHERE window_start < ? - INTERVAL 2 DAY', [window]).catch(() => {})
    }
    return 'recorded' as const
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  } finally {
    conn.release()
  }
}

// Counting starts with the first event or the first look at the report, whichever comes first: both only happen
// once this code is deployed. Never backdated.
export async function activationTime(pool: Pool) {
  await pool.query('INSERT IGNORE INTO reservation_request_tracking (id, activated_at) VALUES (1, UTC_TIMESTAMP(3))')
  const [[row]] = await pool.query<mysql.RowDataPacket[]>('SELECT activated_at FROM reservation_request_tracking WHERE id = 1')
  return row.activated_at as Date
}

export async function hourlyCounts(pool: Pool, from: Date, to: Date) {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT DATE_FORMAT(occurred_at, '%Y-%m-%dT%H:00:00Z') AS hour, COUNT(*) AS n FROM reservation_request_events
      WHERE occurred_at >= ? AND occurred_at < ? GROUP BY hour`,
    [from, to],
  )
  return rows.map((r) => ({ hour: new Date(r.hour as string), count: Number(r.n) }))
}

export async function loadMonthReport(pool: Pool, requestedMonth: unknown, now = new Date()) {
  const activatedAt = await activationTime(pool)
  const month = resolveMonth(requestedMonth, monthBounds(now, activatedAt))
  const { from, to } = monthQueryRange(month)
  const counts = countsByParisDay(await hourlyCounts(pool, from, to))
  return { activatedAt, report: buildMonthReport({ month, now, activatedAt, counts }) }
}

// Figures for the card on the admin home page: this week, last week, this month.
export async function loadSummary(pool: Pool, now = new Date()) {
  const activatedAt = await activationTime(pool)
  const { from, to } = summaryQueryRange(now)
  const counts = countsByParisDay(await hourlyCounts(pool, from, to))
  return { activatedAt, summary: buildSummary({ now, activatedAt, counts }) }
}
