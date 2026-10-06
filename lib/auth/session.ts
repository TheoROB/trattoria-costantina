import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import type mysql from 'mysql2/promise'

export const SESSION_TTL_HOURS = 8
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/ // 32 random bytes, base64url

const hashToken = (token: string) => createHash('sha256').update(token).digest()

export type AdminSession = { adminUserId: number; email: string }

export async function createSession(pool: mysql.Pool, adminUserId: number) {
  const token = randomBytes(32).toString('base64url')
  await pool.query('DELETE FROM admin_sessions WHERE expires_at <= UTC_TIMESTAMP(3)')
  await pool.query(
    `INSERT INTO admin_sessions (token_hash, admin_user_id, created_at, expires_at)
     VALUES (?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3) + INTERVAL ${SESSION_TTL_HOURS} HOUR)`,
    [hashToken(token), adminUserId],
  )
  return { token, expiresAt: new Date(Date.now() + SESSION_TTL_HOURS * 3600_000) }
}

// Expiry is checked by the database on every request: an expired session is refused immediately.
export async function findSession(pool: mysql.Pool, token: string): Promise<AdminSession | null> {
  if (!TOKEN_FORMAT.test(token)) return null
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT s.admin_user_id, u.email
       FROM admin_sessions s JOIN admin_users u ON u.id = s.admin_user_id
      WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3)`,
    [hashToken(token)],
  )
  return rows[0] ? { adminUserId: rows[0].admin_user_id, email: rows[0].email } : null
}

export async function deleteSession(pool: mysql.Pool, token: string) {
  if (!TOKEN_FORMAT.test(token)) return
  await pool.query('DELETE FROM admin_sessions WHERE token_hash = ?', [hashToken(token)])
}
