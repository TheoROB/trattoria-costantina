import mysql from 'mysql2/promise'

export function testDatabaseUrl() {
  const url = process.env.DATABASE_URL_TEST
  if (!url) throw new Error('DATABASE_URL_TEST is required for integration tests (see .env.example)')
  if (!new URL(url).pathname.endsWith('_test')) throw new Error('DATABASE_URL_TEST must point to a *_test database')
  return url
}

export async function resetDatabase(url = testDatabaseUrl()) {
  const conn = await mysql.createConnection(url)
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()',
  )
  await conn.query('SET FOREIGN_KEY_CHECKS = 0')
  for (const { name } of rows) await conn.query(`DROP TABLE \`${name}\``)
  await conn.query('SET FOREIGN_KEY_CHECKS = 1')
  await conn.end()
}
