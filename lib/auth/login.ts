import 'server-only'
import { createHmac } from 'node:crypto'
import type mysql from 'mysql2/promise'
import { verifyPassword } from './password.mts'

export const LOCKOUT = { maxFailures: 5, maxFailuresPerIp: 20, windowMinutes: 15 }

// Hash of a random, discarded password: verified when the email is unknown or locked so that every
// failure costs one Argon2 computation (no trivial timing difference).
const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$Ey+NKejLBW7HVsDkwsvtOQ$5lcOWBG7B0AdO9IWi/KQ3vma/qLzPz66QFHyeb7Ssec'

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

function hmacSecret() {
  const secret = process.env.AUTH_HMAC_SECRET
  return secret && secret.length >= 32 ? secret : null
}

const pseudonymise = (secret: string, kind: string, value: string) =>
  createHmac('sha256', secret).update(`${kind}:${value}`).digest()

async function failures(pool: mysql.Pool, sql: string, params: unknown[]) {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(sql, params)
  return Number(rows[0].n)
}

async function isLocked(pool: mysql.Pool, emailHmac: Buffer, ipHmac: Buffer | null) {
  // Failures since the last success, within the window.
  const emailFailures = await failures(
    pool,
    `SELECT COUNT(*) AS n FROM login_attempts
      WHERE email_hmac = ? AND succeeded = 0
        AND created_at > GREATEST(UTC_TIMESTAMP(3) - INTERVAL ${LOCKOUT.windowMinutes} MINUTE,
          COALESCE((SELECT MAX(created_at) FROM login_attempts WHERE email_hmac = ? AND succeeded = 1), '1000-01-01'))`,
    [emailHmac, emailHmac],
  )
  if (emailFailures >= LOCKOUT.maxFailures) return true
  if (!ipHmac) return false
  const ipFailures = await failures(
    pool,
    `SELECT COUNT(*) AS n FROM login_attempts
      WHERE ip_hmac = ? AND succeeded = 0 AND created_at > UTC_TIMESTAMP(3) - INTERVAL ${LOCKOUT.windowMinutes} MINUTE`,
    [ipHmac],
  )
  return ipFailures >= LOCKOUT.maxFailuresPerIp
}

export type AuthResult = { ok: true; adminUserId: number } | { ok: false }

// Same result for unknown email, wrong password and locked account. Attempts made while locked are
// not recorded, so the lock always ends `windowMinutes` after the failures that caused it.
export async function authenticate(
  pool: mysql.Pool,
  { email, password, ip }: { email: string; password: string; ip: string | null },
): Promise<AuthResult> {
  const secret = hmacSecret()
  if (!secret) {
    console.error('[auth] AUTH_HMAC_SECRET is missing or shorter than 32 characters: login disabled')
    await verifyPassword(password, DUMMY_HASH)
    return { ok: false }
  }
  const normalized = normalizeEmail(email)
  const emailHmac = pseudonymise(secret, 'email', normalized)
  const ipHmac = ip ? pseudonymise(secret, 'ip', ip) : null

  await pool.query('DELETE FROM login_attempts WHERE created_at < UTC_TIMESTAMP(3) - INTERVAL 24 HOUR')
  if (await isLocked(pool, emailHmac, ipHmac)) {
    await verifyPassword(password, DUMMY_HASH)
    return { ok: false }
  }

  const [rows] = await pool.query<mysql.RowDataPacket[]>('SELECT id, password_hash FROM admin_users WHERE email = ?', [normalized])
  const user = rows[0] as { id: number; password_hash: string } | undefined
  const valid = (await verifyPassword(password, user?.password_hash ?? DUMMY_HASH)) && user !== undefined

  await pool.query(
    'INSERT INTO login_attempts (email_hmac, ip_hmac, succeeded, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3))',
    [emailHmac, ipHmac, valid ? 1 : 0],
  )
  return valid ? { ok: true, adminUserId: user.id } : { ok: false }
}
