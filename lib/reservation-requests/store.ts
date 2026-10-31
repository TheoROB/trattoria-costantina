import 'server-only'
import type mysql from 'mysql2/promise'
import type { TrackedPath } from './paths'
import { buildMonthReport, countsByParisDay, monthBounds, monthQueryRange, resolveMonth } from './report'

// Site-wide cap per UTC hour, shared by every Node process through the database (no per-visitor key exists).
// Far above a restaurant's real traffic; bounds the table to ~1.8 million rows a year in the worst case.
export const HOURLY_QUOTA = 200

// Records one opening with the database's own UTC time. The quota row stays locked until commit/rollback, so
// concurrent requests (from any process) can never go past the cap; the event and its quota hit commit together.
export async function recordReservationRequest(pool: mysql.Pool, path: TrackedPath, quota = HOURLY_QUOTA) {
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
    if (hits > quota) {
      await conn.rollback()
      return 'over_quota' as const
    }
    await conn.query('INSERT INTO reservation_request_events (occurred_at, path) VALUES (?, ?)', [now, path])
    await conn.query('INSERT IGNORE INTO reservation_request_tracking (id, activated_at) VALUES (1, ?)', [now])
    await conn.commit()
    await conn.query('DELETE FROM reservation_request_quota WHERE window_start < ? - INTERVAL 2 DAY', [window])
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
export async function activationTime(pool: mysql.Pool) {
  await pool.query('INSERT IGNORE INTO reservation_request_tracking (id, activated_at) VALUES (1, UTC_TIMESTAMP(3))')
  const [[row]] = await pool.query<mysql.RowDataPacket[]>('SELECT activated_at FROM reservation_request_tracking WHERE id = 1')
  return row.activated_at as Date
}

export async function hourlyCounts(pool: mysql.Pool, from: Date, to: Date) {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT DATE_FORMAT(occurred_at, '%Y-%m-%dT%H:00:00Z') AS hour, COUNT(*) AS n FROM reservation_request_events
      WHERE occurred_at >= ? AND occurred_at < ? GROUP BY hour`,
    [from, to],
  )
  return rows.map((r) => ({ hour: new Date(r.hour as string), count: Number(r.n) }))
}

export async function loadMonthReport(pool: mysql.Pool, requestedMonth: unknown, now = new Date()) {
  const activatedAt = await activationTime(pool)
  const month = resolveMonth(requestedMonth, monthBounds(now, activatedAt))
  const { from, to } = monthQueryRange(month)
  const counts = countsByParisDay(await hourlyCounts(pool, from, to))
  return { activatedAt, report: buildMonthReport({ month, now, activatedAt, counts }) }
}
