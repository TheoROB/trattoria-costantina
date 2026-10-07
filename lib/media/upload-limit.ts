import 'server-only'
import type mysql from 'mysql2/promise'

// Image decoding is the most expensive admin operation: cap it per account.
export const UPLOAD_LIMIT = { max: 20, windowMinutes: 10 }

// Records the attempt and returns false when the account is over the limit (nothing recorded then).
export async function allowPhotoUpload(pool: mysql.Pool, adminUserId: number) {
  await pool.query('DELETE FROM media_upload_attempts WHERE created_at < UTC_TIMESTAMP(3) - INTERVAL 24 HOUR')
  const [[row]] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM media_upload_attempts
      WHERE admin_user_id = ? AND created_at > UTC_TIMESTAMP(3) - INTERVAL ? MINUTE`,
    [adminUserId, UPLOAD_LIMIT.windowMinutes],
  )
  if (row.n >= UPLOAD_LIMIT.max) return false
  await pool.query('INSERT INTO media_upload_attempts (admin_user_id, created_at) VALUES (?, UTC_TIMESTAMP(3))', [adminUserId])
  return true
}
