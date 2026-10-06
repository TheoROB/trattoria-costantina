// Usage: npm run db:migrate   (reads DATABASE_URL)
import path from 'node:path'
import { runMigrations } from '../lib/db-migrations.mts'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}
runMigrations(url, path.resolve('db/migrations'))
  .then(({ applied }) => console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date'))
  .catch((error: Error) => {
    console.error(`Migration failed: ${error.message}`)
    process.exit(1)
  })
