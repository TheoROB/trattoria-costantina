import 'server-only'
import type mysql from 'mysql2/promise'
import { addMonths, monthOf, parisDate, resolveMonth } from './report'
import type { SiteReservation } from './signal'

// Site-wide cap per UTC hour, shared by every Node process through the database (no per-visitor key exists).
// Far above what the restaurant can really receive; bounds what a forged flood can add to the admin list.
export const HOURLY_QUOTA = 30

// InnoDB may pick a concurrent upsert of the same new quota row as a deadlock victim: the transaction is rolled
// back as a whole, so trying again is safe and never counts twice.
const RETRYABLE = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'])
export const RECORD_ATTEMPTS = 3

type Pool = Pick<mysql.Pool, 'getConnection' | 'query'>

export async function recordSiteReservation(pool: Pool, reservation: SiteReservation, quota = HOURLY_QUOTA) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await recordOnce(pool, reservation, quota)
    } catch (error) {
      if (attempt >= RECORD_ATTEMPTS || !RETRYABLE.has((error as { code?: string }).code ?? '')) throw error
    }
  }
}

// The quota row stays locked until commit/rollback, so concurrent requests can never go past the cap; the row and
// its quota hit commit together.
async function recordOnce(pool: Pool, { date, time, covers }: SiteReservation, quota: number) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [[{ now }]] = await conn.query<mysql.RowDataPacket[]>('SELECT UTC_TIMESTAMP(3) AS now')
    const window = new Date(Math.floor((now as Date).getTime() / 3_600_000) * 3_600_000)
    await conn.query(
      'INSERT INTO site_reservation_quota (window_start, hits) VALUES (?, 1) ON DUPLICATE KEY UPDATE hits = hits + 1',
      [window],
    )
    const [[{ hits }]] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT hits FROM site_reservation_quota WHERE window_start = ?',
      [window],
    )
    if (Number(hits) > quota) {
      await conn.rollback()
      return 'over_quota' as const
    }
    await conn.query(
      'INSERT INTO site_reservations (received_at, meal_date, meal_time, covers) VALUES (?, ?, ?, ?)',
      [now, date, time, covers],
    )
    await conn.commit()
    // Housekeeping once per hour, after the commit: a failure here must not turn into an error for the visitor.
    if (Number(hits) === 1) {
      await conn.query('DELETE FROM site_reservation_quota WHERE window_start < ? - INTERVAL 2 DAY', [window]).catch(() => {})
    }
    return 'recorded' as const
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  } finally {
    conn.release()
  }
}

export type ReportRow = SiteReservation & { id: number; receivedAt: Date }

// One month by meal date. Navigation stays within the months that have reservations, and always reaches the current one.
export async function loadMonth(pool: Pick<mysql.Pool, 'query'>, requested: unknown, now = new Date()) {
  const current = monthOf(parisDate(now))
  const [[range]] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT DATE_FORMAT(MIN(meal_date), '%Y-%m') AS earliest, DATE_FORMAT(MAX(meal_date), '%Y-%m') AS latest FROM site_reservations`,
  )
  const earliest: string = range.earliest && range.earliest < current ? range.earliest : current
  const latest: string = range.latest && range.latest > current ? range.latest : current
  const month = resolveMonth(requested, current, { earliest, latest })
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT id, received_at, DATE_FORMAT(meal_date, '%Y-%m-%d') AS date, TIME_FORMAT(meal_time, '%H:%i') AS time, covers
       FROM site_reservations WHERE meal_date >= ? AND meal_date < ? ORDER BY meal_date, meal_time, id`,
    [`${month}-01`, `${addMonths(month, 1)}-01`],
  )
  const reservations: ReportRow[] = rows.map((r) => ({ id: Number(r.id), receivedAt: r.received_at as Date, date: r.date, time: r.time, covers: Number(r.covers) }))
  return {
    month,
    reservations,
    totalCovers: reservations.reduce((sum, r) => sum + r.covers, 0),
    previous: month > earliest ? addMonths(month, -1) : null,
    next: month < latest ? addMonths(month, 1) : null,
  }
}
