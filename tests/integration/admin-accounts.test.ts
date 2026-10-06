import { execFileSync } from 'node:child_process'
import path from 'node:path'
import mysql from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from '../../lib/db-migrations.mts'
import { verifyPassword } from '../../lib/auth/password.mts'
import { resetDatabase, testDatabaseUrl } from './db-helpers'

const url = testDatabaseUrl()
let conn: mysql.Connection

// Runs the real CLI, password on stdin (never in argv or env).
function cli(args: string[], stdin = '') {
  try {
    const stdout = execFileSync(process.execPath, ['scripts/admin-user.mts', ...args], {
      input: stdin,
      env: { PATH: process.env.PATH, DATABASE_URL: url, NODE_ENV: 'test' },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { code: 0, out: stdout }
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string }
    return { code: e.status, out: e.stdout + e.stderr }
  }
}

async function users() {
  const [rows] = await conn.query<mysql.RowDataPacket[]>('SELECT id, email, password_hash FROM admin_users ORDER BY id')
  return rows
}

beforeAll(async () => {
  await resetDatabase()
  await runMigrations(url, path.resolve('db/migrations'))
  conn = await mysql.createConnection(url)
})
afterAll(async () => conn.end())

describe('scripts/admin-user.mts', () => {
  it('creates an account with a normalised email and an Argon2id hash, without echoing the password', async () => {
    const result = cli(['set', '--email', ' Julien@Admin.TEST '], 'julien-cli-passphrase\n')
    expect(result.code).toBe(0)
    expect(result.out).not.toContain('julien-cli-passphrase')
    const [user] = await users()
    expect(user.email).toBe('julien@admin.test')
    expect(user.password_hash).toMatch(/^\$argon2id\$/)
    expect(await verifyPassword('julien-cli-passphrase', user.password_hash)).toBe(true)
  })

  it('refuses a short password and an invalid email', async () => {
    expect(cli(['set', '--email', 'theo@admin.test'], 'short\n').code).not.toBe(0)
    expect(cli(['set', '--email', 'not-an-email'], 'long-enough-passphrase\n').code).not.toBe(0)
    expect(await users()).toHaveLength(1)
  })

  it('allows exactly two accounts', async () => {
    expect(cli(['set', '--email', 'theo@admin.test'], 'theo-cli-passphrase-1\n').code).toBe(0)
    const third = cli(['set', '--email', 'intruder@admin.test'], 'intruder-passphrase\n')
    expect(third.code).not.toBe(0)
    expect(third.out).toMatch(/2/)
    expect(await users()).toHaveLength(2)
  })

  it('rotating a password revokes that account sessions only', async () => {
    const [julien, theo] = await users()
    for (const id of [julien.id, theo.id]) {
      await conn.query(
        'INSERT INTO admin_sessions VALUES (RANDOM_BYTES(32), ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3) + INTERVAL 1 HOUR)',
        [id],
      )
    }
    expect(cli(['set', '--email', 'julien@admin.test'], 'julien-new-passphrase\n').code).toBe(0)
    const [rows] = await conn.query<mysql.RowDataPacket[]>('SELECT admin_user_id FROM admin_sessions')
    expect(rows.map((r) => r.admin_user_id)).toEqual([theo.id])
    expect(await verifyPassword('julien-new-passphrase', (await users())[0].password_hash)).toBe(true)
  })

  it('lists accounts without hashes', () => {
    const result = cli(['list'])
    expect(result.code).toBe(0)
    expect(result.out).toContain('julien@admin.test')
    expect(result.out).toContain('theo@admin.test')
    expect(result.out).not.toContain('argon2')
  })
})
