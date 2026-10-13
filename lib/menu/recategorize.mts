// Moves items out of a retired category (LEGACY_MENU_CATEGORIES) into current ones, for
// scripts/menu-recategorize.mts. Plain .mts without `server-only` so the script can import it.
import type mysql from 'mysql2/promise'
import { LEGACY_MENU_CATEGORIES, MENU_CATEGORIES, isMenuCategoryKey, type MenuCategoryKey } from './categories.ts'

export type LegacyItem = { id: number; categoryKey: string; name: string; priceCents: number }
// Item id -> new category.
export type Recategorization = Map<number, MenuCategoryKey>

const LEGACY_KEYS = LEGACY_MENU_CATEGORIES.map((c) => c.key)

async function selectLegacyItems(conn: mysql.Connection, lock: boolean) {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT id, category_key, name, price_cents, position FROM menu_items
      WHERE category_key IN (?) ORDER BY category_key, position, id${lock ? ' FOR UPDATE' : ''}`,
    [LEGACY_KEYS],
  )
  return rows.map((r) => ({ id: r.id as number, categoryKey: r.category_key as string, name: r.name as string, priceCents: r.price_cents as number }))
}

export function listLegacyItems(conn: mysql.Connection): Promise<LegacyItem[]> {
  return selectLegacyItems(conn, false)
}

// The mapping file is a JSON object { "<item id>": "<category key>" }; it may cover only some of the items.
export function parseRecategorization(json: unknown, items: LegacyItem[]): { ok: true; plan: Recategorization } | { ok: false; errors: string[] } {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { ok: false, errors: ['The mapping must be a JSON object { "<item id>": "<category key>" }'] }
  const legacyIds = new Set(items.map((i) => i.id))
  const plan: Recategorization = new Map()
  const errors: string[] = []
  for (const [rawId, key] of Object.entries(json)) {
    const id = Number(rawId)
    if (!/^\d+$/.test(rawId) || !legacyIds.has(id)) errors.push(`${rawId}: not an item of a retired category`)
    else if (typeof key !== 'string' || !isMenuCategoryKey(key)) errors.push(`${rawId}: unknown category ${JSON.stringify(key)}`)
    else plan.set(id, key)
  }
  if (plan.size === 0 && errors.length === 0) errors.push('The mapping is empty')
  return errors.length > 0 ? { ok: false, errors } : { ok: true, plan }
}

async function renumber(conn: mysql.Connection, ids: number[]) {
  for (const [position, id] of ids.entries()) await conn.query('UPDATE menu_items SET position = ? WHERE id = ?', [position, id])
}

// All or nothing. Moved items go to the end of their new category, in their current order, and are audited
// (no admin account: the change comes from the command line).
export async function applyRecategorization(conn: mysql.Connection, plan: Recategorization) {
  await conn.beginTransaction()
  try {
    const items = await selectLegacyItems(conn, true)
    const stale = [...plan.keys()].filter((id) => !items.some((i) => i.id === id))
    if (stale.length > 0) throw new Error(`No longer in a retired category: ${stale.join(', ')}`)

    for (const { key } of MENU_CATEGORIES) {
      const moving = items.filter((i) => plan.get(i.id) === key)
      if (moving.length === 0) continue
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM menu_items WHERE category_key = ? ORDER BY position, id FOR UPDATE',
        [key],
      )
      for (const item of moving) {
        await conn.query('UPDATE menu_items SET category_key = ? WHERE id = ?', [key, item.id])
        await conn.query(
          `INSERT INTO admin_audit_log (admin_user_id, action, menu_item_id, menu_item_name, created_at)
           VALUES (NULL, 'menu_item.recategorize', ?, ?, UTC_TIMESTAMP(3))`,
          [item.id, item.name],
        )
      }
      await renumber(conn, [...rows.map((r) => r.id as number), ...moving.map((i) => i.id)])
    }
    for (const key of LEGACY_KEYS) {
      await renumber(conn, items.filter((i) => i.categoryKey === key && !plan.has(i.id)).map((i) => i.id))
    }
    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  }
}
