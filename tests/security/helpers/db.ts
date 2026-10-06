import fs from 'node:fs'
import type { ExecuteValues } from 'mysql2'
import mysql, { type ResultSetHeader, type RowDataPacket } from 'mysql2/promise'

if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local')

const TEST_ITEM_PREFIX = 'Security test '

export function testDatabaseUrl() {
  const value = process.env.DATABASE_URL_TEST
  if (!value) throw new Error('DATABASE_URL_TEST is required for security tests')

  const database = decodeURIComponent(new URL(value).pathname.slice(1))
  if (!database.endsWith('_test')) {
    throw new Error('Refusing to use a database whose name does not end with _test')
  }
  return value
}

async function connection() {
  return mysql.createConnection(testDatabaseUrl())
}

export async function query<T extends RowDataPacket[]>(sql: string, values: ExecuteValues = []) {
  const db = await connection()
  try {
    const [rows] = await db.execute<T>(sql, values)
    return rows
  } finally {
    await db.end()
  }
}

export async function execute(sql: string, values: ExecuteValues = []) {
  const db = await connection()
  try {
    const [result] = await db.execute<ResultSetHeader>(sql, values)
    return result
  } finally {
    await db.end()
  }
}

export function uniqueItemName(label: string) {
  return `${TEST_ITEM_PREFIX}${label} ${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export async function insertMenuItem(overrides: Record<string, unknown> = {}) {
  const values = {
    category_key: 'pizzas',
    name: uniqueItemName('fixture'),
    description: 'Fixture reserved for the independent security suite',
    price_cents: 1250,
    is_available: 1,
    is_visible: 1,
    position: 9000,
    ...overrides,
  }
  const columns = Object.keys(values)
  const placeholders = columns.map(() => '?').join(', ')
  const result = await execute(
    `INSERT INTO menu_items (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${placeholders})`,
    Object.values(values) as ExecuteValues[],
  )
  return { id: result.insertId, ...values }
}

export async function deleteSecurityData() {
  await execute('DELETE FROM admin_audit_log')
  await execute('DELETE FROM menu_items WHERE name LIKE ?', [`${TEST_ITEM_PREFIX}%`])
  await execute('DELETE FROM login_attempts')
}

export async function adminUserId(email: string) {
  const rows = await query<(RowDataPacket & { id: number })[]>('SELECT id FROM admin_users WHERE email = ?', [email])
  if (rows.length !== 1) throw new Error(`Expected one admin account for ${email}`)
  return rows[0].id
}

export async function expireSessions(email: string) {
  await execute(
    `UPDATE admin_sessions
       SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 MINUTE
     WHERE admin_user_id = (SELECT id FROM admin_users WHERE email = ?)`,
    [email],
  )
}

export async function moveLoginAttemptsOutsideWindow() {
  await execute('UPDATE login_attempts SET created_at = UTC_TIMESTAMP(3) - INTERVAL 16 MINUTE')
}

export async function sessionCount(email: string) {
  const rows = await query<(RowDataPacket & { count: number })[]>(
    `SELECT COUNT(*) AS count
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.admin_user_id
      WHERE u.email = ?`,
    [email],
  )
  return Number(rows[0].count)
}

export async function menuItem(id: number) {
  const rows = await query<RowDataPacket[]>('SELECT * FROM menu_items WHERE id = ?', [id])
  return rows[0] ?? null
}

export async function menuItemsFingerprint() {
  const rows = await query<RowDataPacket[]>(
    `SELECT id, category_key, name, description, price_cents, image_key, image_alt,
            is_available, is_visible, position
       FROM menu_items
      ORDER BY id`,
  )
  return JSON.stringify(rows)
}

export async function auditRowsSince(id: number) {
  return query<
    (RowDataPacket & {
      id: number
      admin_user_id: number | null
      action: string
      menu_item_id: number | null
      menu_item_name: string | null
    })[]
  >(
    `SELECT id, admin_user_id, action, menu_item_id, menu_item_name
       FROM admin_audit_log
      WHERE id > ?
      ORDER BY id`,
    [id],
  )
}

export async function latestAuditId() {
  const rows = await query<(RowDataPacket & { id: number })[]>('SELECT COALESCE(MAX(id), 0) AS id FROM admin_audit_log')
  return Number(rows[0].id)
}
