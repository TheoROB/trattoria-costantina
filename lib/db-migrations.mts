// Applies pending SQL migrations from a directory, in order, exactly once.
// CLI: scripts/db-migrate.mts (`npm run db:migrate`), never run automatically by `next build`.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import mysql from 'mysql2/promise'

const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/
const LOCK_NAME = 'trattoria_migrations'

export async function runMigrations(databaseUrl: string, dir: string) {
  const files = fs.readdirSync(dir).filter((f) => MIGRATION_FILE.test(f)).sort()
  const conn = await mysql.createConnection({ uri: databaseUrl, multipleStatements: true })
  const applied: string[] = []
  try {
    const [[lock]] = await conn.query<mysql.RowDataPacket[]>('SELECT GET_LOCK(?, 10) AS acquired', [LOCK_NAME])
    if (lock.acquired !== 1) throw new Error('Another migration run holds the lock')

    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) NOT NULL PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci`)
    const [rows] = await conn.query<mysql.RowDataPacket[]>('SELECT version, checksum FROM schema_migrations')
    const done = new Map(rows.map((r) => [r.version as string, r.checksum as string]))

    for (const file of files) {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8')
      const checksum = createHash('sha256').update(sql).digest('hex')
      const previous = done.get(file)
      if (previous) {
        if (previous !== checksum) throw new Error(`Checksum mismatch for applied migration ${file}: never edit an applied migration`)
        continue
      }
      // MySQL DDL is not transactional: keep one schema change per migration file.
      await conn.query(sql)
      await conn.query('INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)', [file, checksum])
      applied.push(file)
    }
    return { applied }
  } finally {
    await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => {})
    await conn.end()
  }
}
