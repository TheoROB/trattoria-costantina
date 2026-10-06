// Admin accounts (exactly two, same rights). Reads DATABASE_URL. The password is read from stdin
// (hidden prompt in a terminal), never from argv or the environment, and is never printed.
//
//   npm run admin:user -- set --email julien@example.com    create the account or rotate its password
//   npm run admin:user -- list                              list account emails
import { parseArgs } from 'node:util'
import mysql from 'mysql2/promise'
import { hashPassword } from '../lib/auth/password.mts'

const MAX_ACCOUNTS = 2
const PASSWORD_LENGTH = { min: 12, max: 256 }
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

async function readHidden(prompt: string) {
  process.stdout.write(prompt)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  let value = ''
  for await (const chunk of process.stdin) {
    for (const char of String(chunk)) {
      if (char === '\r' || char === '\n') {
        process.stdin.setRawMode(false)
        process.stdin.pause()
        process.stdout.write('\n')
        return value
      }
      if (char === '\u0003') fail('\nCancelled')
      value = char === '\u007f' ? value.slice(0, -1) : value + char
    }
  }
  return value
}

async function readPassword() {
  if (process.stdin.isTTY) {
    const first = await readHidden('New password: ')
    if ((await readHidden('Repeat password: ')) !== first) fail('Passwords do not match')
    return first
  }
  let input = ''
  for await (const chunk of process.stdin) input += chunk
  return input.replace(/\r?\n$/, '')
}

const url = process.env.DATABASE_URL
if (!url) fail('DATABASE_URL is not set')

const { positionals, values } = parseArgs({ allowPositionals: true, options: { email: { type: 'string' } } })
const command = positionals[0]
const conn = await mysql.createConnection(url)

try {
  if (command === 'list') {
    const [rows] = await conn.query<mysql.RowDataPacket[]>('SELECT email, created_at FROM admin_users ORDER BY id')
    for (const row of rows) console.log(`${row.email}\tcreated ${row.created_at.toISOString()}`)
  } else if (command === 'set') {
    const email = (values.email ?? '').trim().toLowerCase()
    if (email.length > 254 || !EMAIL.test(email)) fail('Invalid or missing --email')
    const password = await readPassword()
    if (password.length < PASSWORD_LENGTH.min || password.length > PASSWORD_LENGTH.max) {
      fail(`The password must contain ${PASSWORD_LENGTH.min} to ${PASSWORD_LENGTH.max} characters`)
    }
    const passwordHash = await hashPassword(password)

    await conn.beginTransaction()
    const [rows] = await conn.query<mysql.RowDataPacket[]>('SELECT id, email FROM admin_users FOR UPDATE')
    const existing = rows.find((r) => r.email === email)
    if (existing) {
      await conn.query('UPDATE admin_users SET password_hash = ? WHERE id = ?', [passwordHash, existing.id])
      await conn.query('DELETE FROM admin_sessions WHERE admin_user_id = ?', [existing.id])
    } else if (rows.length >= MAX_ACCOUNTS) {
      await conn.rollback()
      fail(`Refused: the admin is limited to ${MAX_ACCOUNTS} accounts`)
    } else {
      await conn.query('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)', [email, passwordHash])
    }
    await conn.commit()
    console.log(existing ? `Password updated for ${email} (sessions revoked)` : `Account created for ${email}`)
  } else {
    fail('Usage: admin-user.mts set --email <email> | list')
  }
} finally {
  await conn.end()
}
