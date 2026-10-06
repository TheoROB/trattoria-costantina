import 'server-only'
import mysql from 'mysql2/promise'

const globalForDb = globalThis as unknown as { trattoriaPool?: mysql.Pool }

export function createPool(databaseUrl: string) {
  return mysql.createPool({ uri: databaseUrl, connectionLimit: 5, connectTimeout: 5000, timezone: 'Z' })
}

// One pool per process (also survives dev hot reloads). Throws if DATABASE_URL is missing.
export function getPool() {
  if (!globalForDb.trattoriaPool) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    globalForDb.trattoriaPool = createPool(url)
  }
  return globalForDb.trattoriaPool
}

export async function closePool() {
  await globalForDb.trattoriaPool?.end()
  globalForDb.trattoriaPool = undefined
}
