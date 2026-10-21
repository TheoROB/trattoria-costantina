// Fills empty menu descriptions from a reviewed mapping. Reads DATABASE_URL.
//
//   npm run menu:descriptions -- list                  every item with its id, category, price and description state
//   npm run menu:descriptions -- check mapping.json    validate a mapping and show what would change
//   npm run menu:descriptions -- apply mapping.json    apply it (all or nothing)
//
// mapping.json: [{ "id": 12, "name": "Margherita", "currentPrice": 1000, "description": "...", "source": "...",
// "confidence": "high" }]. Only "high" entries are imported; id, name and price must match the database. A
// description already set is never overwritten: it is listed as a conflict.
//
// scripts/menu-descriptions.json holds the reviewed descriptions with "id": null: copy it, fill each id from `list`
// on the target database, then check and apply the copy.
import fs from 'node:fs'
import mysql from 'mysql2/promise'
import { applyDescriptions, isEmptyDescription, listItems, planDescriptions, type Conflict } from '../lib/menu/descriptions.mts'

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

const url = process.env.DATABASE_URL
if (!url) fail('DATABASE_URL is not set')

const [command, file] = process.argv.slice(2)
if (!['list', 'check', 'apply'].includes(command) || (command !== 'list' && !file)) {
  fail('Usage: menu:descriptions -- list | check <mapping.json> | apply <mapping.json>')
}

function readMapping(path: string) {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8')) as unknown
  } catch (error) {
    fail(`Cannot read ${path}: ${(error as Error).message}`)
  }
}

function printConflicts(conflicts: Conflict[]) {
  for (const c of conflicts) console.log(`CONFLICT ${c.id}\t${c.name}\tkept: ${c.current}\tproposed: ${c.proposed}`)
}

const conn = await mysql.createConnection(url)
try {
  if (command === 'list') {
    const items = await listItems(conn)
    for (const i of items) console.log(`${i.id}\t${i.categoryKey}\t${i.priceCents}\t${isEmptyDescription(i.description) ? 'empty' : 'set'}\t${i.name}`)
    console.log(`\n${items.length} item(s), ${items.filter((i) => isEmptyDescription(i.description)).length} without description`)
  } else if (command === 'check') {
    const plan = planDescriptions(readMapping(file), await listItems(conn))
    if (!plan.ok) fail(plan.errors.join('\n'))
    for (const u of plan.updates) console.log(`${u.id}\t${u.name}\t<- ${u.description}`)
    printConflicts(plan.conflicts)
    console.log(
      `${plan.updates.length} description(s) would be set, ${plan.conflicts.length} conflict(s) left as is, ` +
        `${plan.skipped} entry(ies) not high confidence; nothing changed (use apply)`,
    )
  } else {
    const result = await applyDescriptions(conn, readMapping(file)).catch((error: Error) => fail(`Nothing changed: ${error.message}`))
    for (const u of result.updated) console.log(`${u.id}\t${u.name}\t<- ${u.description}`)
    printConflicts(result.conflicts)
    console.log(`Set ${result.updated.length} description(s); ${result.conflicts.length} conflict(s) left as is`)
  }
} finally {
  await conn.end()
}
