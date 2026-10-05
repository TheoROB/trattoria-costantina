import path from 'node:path'
import mysql from 'mysql2/promise'
import { runMigrations } from '../../lib/db-migrations.mts'
import { resetDatabase, testDatabaseUrl } from '../integration/db-helpers'

// Test-only fixtures: written to the *_test database, never shipped.
export const E2E_MENU = [
  // [category, name, price_cents, is_available, is_visible, position]
  ['antipasti', 'Antipasto Test 1', 800, 1, 1, 1],
  ['antipasti', 'Antipasto Test 2', 900, 1, 1, 2],
  ['pates_plats', 'Plat Test 1', 1400, 1, 1, 1],
  ['pizzas', 'Pizza Test 1', 1100, 1, 1, 1],
  ['pizzas', 'Pizza Test 2', 1250, 1, 1, 2],
  ['pizzas', 'Pizza Test 3', 1300, 1, 1, 3],
  ['pizzas', 'Pizza Test 4', 1350, 1, 1, 4],
  ['pizzas', 'Pizza Test 5', 1400, 1, 1, 5],
  ['pizzas', 'Pizza Test Indisponible', 1200, 0, 1, 0],
  ['pizzas', 'Pizza Test Masquée', 1000, 1, 0, 0],
  ['desserts', 'Dessert Test 1', 700, 1, 1, 1],
  ['boissons', 'Boisson Test 1', 300, 1, 1, 1],
] as const

export default async function globalSetup() {
  const url = testDatabaseUrl()
  await resetDatabase(url)
  await runMigrations(url, path.resolve('db/migrations'))
  const conn = await mysql.createConnection(url)
  for (const [category_key, name, price_cents, is_available, is_visible, position] of E2E_MENU) {
    await conn.query('INSERT INTO menu_items SET ?', [
      { category_key, name, price_cents, is_available, is_visible, position, description: `Description de ${name}` },
    ])
  }
  await conn.end()
}
