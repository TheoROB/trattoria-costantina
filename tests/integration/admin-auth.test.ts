import path from 'node:path'
import mysql from 'mysql2/promise'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../../lib/db-migrations.mts'
import { hashPassword } from '../../lib/auth/password.mts'
import { resetDatabase, testDatabaseUrl } from './db-helpers'

const url = testDatabaseUrl()
process.env.AUTH_HMAC_SECRET = 'integration-test-hmac-secret-0123456789abcdef'
const { createPool } = await import('../../lib/db')
const { createSession, findSession, deleteSession, SESSION_TTL_HOURS } = await import('../../lib/auth/session')
const { authenticate, LOCKOUT } = await import('../../lib/auth/login')

const pool = createPool(url)
const EMAIL = 'julien@admin.test'
const PASSWORD = 'julien-integration-passphrase'
let userId: number

async function count(table: string) {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(`SELECT COUNT(*) AS n FROM ${table}`)
  return Number(rows[0].n)
}

beforeAll(async () => {
  await resetDatabase()
  await runMigrations(url, path.resolve('db/migrations'))
  const [result] = await pool.query<mysql.ResultSetHeader>('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)', [
    EMAIL,
    await hashPassword(PASSWORD),
  ])
  userId = result.insertId
})
beforeEach(async () => {
  await pool.query('DELETE FROM login_attempts')
  await pool.query('DELETE FROM admin_sessions')
})
afterAll(async () => pool.end())

describe('sessions', () => {
  it('stores only the SHA-256 of a random 256-bit token and finds the admin back', async () => {
    const { token, expiresAt } = await createSession(pool, userId)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const [rows] = await pool.query<mysql.RowDataPacket[]>('SELECT token_hash, expires_at FROM admin_sessions')
    expect(rows).toHaveLength(1)
    expect(Buffer.from(rows[0].token_hash).toString('base64url')).not.toBe(token)
    expect(Math.abs(expiresAt.getTime() - Date.now() - SESSION_TTL_HOURS * 3600_000)).toBeLessThan(60_000)
    expect(await findSession(pool, token)).toEqual({ adminUserId: userId, email: EMAIL })
  })

  it('creates a different token for every session', async () => {
    const a = await createSession(pool, userId)
    const b = await createSession(pool, userId)
    expect(a.token).not.toBe(b.token)
  })

  it('refuses unknown, malformed and expired tokens', async () => {
    const { token } = await createSession(pool, userId)
    expect(await findSession(pool, token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'))).toBeNull()
    for (const bad of ['', 'x', 'a'.repeat(5000), "' OR 1=1 --"]) expect(await findSession(pool, bad)).toBeNull()
    await pool.query('UPDATE admin_sessions SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND')
    expect(await findSession(pool, token)).toBeNull()
  })

  it('revokes a session by deleting its row', async () => {
    const { token } = await createSession(pool, userId)
    await deleteSession(pool, token)
    expect(await count('admin_sessions')).toBe(0)
    expect(await findSession(pool, token)).toBeNull()
  })
})

describe('authenticate', () => {
  it('accepts the right credentials (email normalised) and records a pseudonymised success', async () => {
    expect(await authenticate(pool, { email: '  Julien@Admin.TEST ', password: PASSWORD, ip: '203.0.113.7' })).toEqual({
      ok: true,
      adminUserId: userId,
    })
    const [rows] = await pool.query<mysql.RowDataPacket[]>('SELECT * FROM login_attempts')
    expect(rows).toHaveLength(1)
    expect(rows[0].succeeded).toBe(1)
    expect(Buffer.from(rows[0].email_hmac).length).toBe(32)
    expect(JSON.stringify(rows)).not.toContain('julien')
  })

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrong = await authenticate(pool, { email: EMAIL, password: 'nope-nope-nope', ip: null })
    const unknown = await authenticate(pool, { email: 'nobody@admin.test', password: PASSWORD, ip: null })
    expect(wrong).toEqual({ ok: false })
    expect(unknown).toEqual({ ok: false })
    expect(await count('login_attempts')).toBe(2)
  })

  it('locks an email after 5 failures in 15 minutes, even with the right password, then unlocks', async () => {
    for (let i = 0; i < LOCKOUT.maxFailures; i++) await authenticate(pool, { email: EMAIL, password: 'bad', ip: null })
    expect(await authenticate(pool, { email: EMAIL, password: PASSWORD, ip: null })).toEqual({ ok: false })
    // Attempts made while locked are not recorded, so an attacker cannot extend the lock indefinitely.
    expect(await count('login_attempts')).toBe(LOCKOUT.maxFailures)
    await pool.query('UPDATE login_attempts SET created_at = created_at - INTERVAL 16 MINUTE')
    expect(await authenticate(pool, { email: EMAIL, password: PASSWORD, ip: null })).toEqual({ ok: true, adminUserId: userId })
  })

  it('locks unknown emails the same way', async () => {
    for (let i = 0; i < LOCKOUT.maxFailures; i++) await authenticate(pool, { email: 'ghost@admin.test', password: 'x', ip: null })
    await authenticate(pool, { email: 'ghost@admin.test', password: 'x', ip: null })
    expect(await count('login_attempts')).toBe(LOCKOUT.maxFailures)
  })

  it('a success resets the failure count', async () => {
    for (let i = 0; i < LOCKOUT.maxFailures - 1; i++) await authenticate(pool, { email: EMAIL, password: 'bad', ip: null })
    await authenticate(pool, { email: EMAIL, password: PASSWORD, ip: null })
    for (let i = 0; i < LOCKOUT.maxFailures - 1; i++) await authenticate(pool, { email: EMAIL, password: 'bad', ip: null })
    expect(await authenticate(pool, { email: EMAIL, password: PASSWORD, ip: null })).toMatchObject({ ok: true })
  })

  it('limits failures per client IP when an IP is known', async () => {
    for (let i = 0; i < LOCKOUT.maxFailuresPerIp; i++) {
      await authenticate(pool, { email: `spray${i}@admin.test`, password: 'x', ip: '198.51.100.9' })
    }
    expect(await authenticate(pool, { email: EMAIL, password: PASSWORD, ip: '198.51.100.9' })).toEqual({ ok: false })
    expect(await authenticate(pool, { email: EMAIL, password: PASSWORD, ip: '198.51.100.10' })).toMatchObject({ ok: true })
  })

  it('purges attempts older than 24 hours', async () => {
    await authenticate(pool, { email: EMAIL, password: 'bad', ip: null })
    await pool.query('UPDATE login_attempts SET created_at = created_at - INTERVAL 25 HOUR')
    await authenticate(pool, { email: EMAIL, password: 'bad', ip: null })
    expect(await count('login_attempts')).toBe(1)
  })

  it('fails closed without AUTH_HMAC_SECRET', async () => {
    const secret = process.env.AUTH_HMAC_SECRET
    delete process.env.AUTH_HMAC_SECRET
    try {
      expect(await authenticate(pool, { email: EMAIL, password: PASSWORD, ip: null })).toEqual({ ok: false })
    } finally {
      process.env.AUTH_HMAC_SECRET = secret
    }
  })
})
