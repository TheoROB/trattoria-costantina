// Moves the items still in a retired category (such as "boissons") into the current categories. Reads DATABASE_URL.
//
//   npm run menu:recategorize -- list                  items to move, with their ids
//   npm run menu:recategorize -- check mapping.json    validate a mapping and show what would change
//   npm run menu:recategorize -- apply mapping.json    apply it (all or nothing)
//
// mapping.json: { "<item id>": "<category key>" }, e.g. { "12": "spritz", "13": "vins" }. Items left out stay where
// they are; they can also be moved one by one from the admin.
import fs from 'node:fs'
import mysql from 'mysql2/promise'
import { MENU_CATEGORIES } from '../lib/menu/categories.ts'
import { applyRecategorization, listLegacyItems, parseRecategorization } from '../lib/menu/recategorize.mts'

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

const url = process.env.DATABASE_URL
if (!url) fail('DATABASE_URL is not set')

const [command, file] = process.argv.slice(2)
if (!['list', 'check', 'apply'].includes(command) || (command !== 'list' && !file)) {
  fail('Usage: menu:recategorize -- list | check <mapping.json> | apply <mapping.json>')
}

function readMapping(path: string) {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8')) as unknown
  } catch (error) {
    fail(`Cannot read ${path}: ${(error as Error).message}`)
  }
}

const conn = await mysql.createConnection(url)
try {
  const items = await listLegacyItems(conn)
  if (command === 'list') {
    if (items.length === 0) console.log('No item left in a retired category')
    for (const item of items) console.log(`${item.id}\t${item.categoryKey}\t${item.name}`)
    console.log(`\nCategory keys: ${MENU_CATEGORIES.map((c) => c.key).join(', ')}`)
  } else {
    const result = parseRecategorization(readMapping(file), items)
    if (!result.ok) fail(result.errors.join('\n'))
    for (const [id, key] of result.plan) console.log(`${id}\t${items.find((i) => i.id === id)?.name}\t-> ${key}`)
    if (command === 'apply') {
      await applyRecategorization(conn, result.plan).catch((error: Error) => fail(`Nothing changed: ${error.message}`))
      console.log(`Moved ${result.plan.size} item(s); ${items.length - result.plan.size} left in a retired category`)
    } else {
      console.log(`${result.plan.size} item(s) would move; nothing changed (use apply)`)
    }
  }
} finally {
  await conn.end()
}
