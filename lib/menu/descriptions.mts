// Fills empty menu descriptions from a reviewed mapping, for scripts/menu-descriptions.mts. Plain .mts without
// `server-only` so the script can import it. Only the description column is written, and only when it is empty.
import type mysql from 'mysql2/promise'

export type Item = { id: number; categoryKey: string; name: string; priceCents: number; description: string | null }
export type Update = { id: number; name: string; description: string }
export type Conflict = { id: number; name: string; current: string; proposed: string }
export type Plan = { ok: true; updates: Update[]; conflicts: Conflict[]; skipped: number } | { ok: false; errors: string[] }

// Same limit as the column and the admin form.
const MAX_DESCRIPTION = 400

async function selectItems(conn: mysql.Connection, lock: boolean): Promise<Item[]> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT id, category_key, name, price_cents, description FROM menu_items ORDER BY category_key, position, id${lock ? ' FOR UPDATE' : ''}`,
  )
  return rows.map((r) => ({
    id: r.id as number,
    categoryKey: r.category_key as string,
    name: r.name as string,
    priceCents: r.price_cents as number,
    description: r.description as string | null,
  }))
}

export function listItems(conn: mysql.Connection) {
  return selectItems(conn, false)
}

export function isEmptyDescription(description: string | null) {
  return description === null || description.trim() === ''
}

// The mapping is a JSON array of { id, name, currentPrice, description, source, confidence }. Entries that are not
// confidence "high" are skipped. Each kept entry must match its item by id, exact name and current price, or the
// whole mapping is refused. An item that already has a description is never overwritten: it is a conflict.
export function planDescriptions(json: unknown, items: Item[]): Plan {
  if (!Array.isArray(json)) return { ok: false, errors: ['The mapping must be a JSON array of entries'] }
  const byId = new Map(items.map((i) => [i.id, i]))
  const seen = new Set<number>()
  const updates: Update[] = []
  const conflicts: Conflict[] = []
  const errors: string[] = []
  let skipped = 0
  for (const [index, raw] of json.entries()) {
    const entry = (raw ?? {}) as Record<string, unknown>
    const label = `#${index} (${JSON.stringify(entry.name)})`
    if (entry.confidence !== 'high') {
      skipped++
      continue
    }
    const item = typeof entry.id === 'number' ? byId.get(entry.id) : undefined
    const description = typeof entry.description === 'string' ? entry.description.trim() : ''
    if (!item) errors.push(`${label}: no item with id ${JSON.stringify(entry.id)}`)
    else if (seen.has(item.id)) errors.push(`${label}: item ${item.id} appears twice`)
    else if (entry.name !== item.name) errors.push(`${label}: item ${item.id} is named ${JSON.stringify(item.name)}`)
    else if (entry.currentPrice !== item.priceCents) errors.push(`${label}: item ${item.id} costs ${item.priceCents} cents, not ${JSON.stringify(entry.currentPrice)}`)
    else if (description === '') errors.push(`${label}: empty description`)
    else if (description.length > MAX_DESCRIPTION) errors.push(`${label}: description longer than ${MAX_DESCRIPTION} characters`)
    else if (!isEmptyDescription(item.description)) conflicts.push({ id: item.id, name: item.name, current: item.description as string, proposed: description })
    else updates.push({ id: item.id, name: item.name, description })
    if (item) seen.add(item.id)
  }
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, updates, conflicts, skipped }
}

// All or nothing: the mapping is checked again against the locked rows, then each update is audited (no admin
// account: the change comes from the command line).
export async function applyDescriptions(conn: mysql.Connection, json: unknown) {
  await conn.beginTransaction()
  try {
    const plan = planDescriptions(json, await selectItems(conn, true))
    if (!plan.ok) throw new Error(plan.errors.join('\n'))
    for (const update of plan.updates) {
      const [result] = await conn.query<mysql.ResultSetHeader>(
        "UPDATE menu_items SET description = ? WHERE id = ? AND (description IS NULL OR TRIM(description) = '')",
        [update.description, update.id],
      )
      if (result.affectedRows !== 1) throw new Error(`Item ${update.id} changed in the meantime`)
      await conn.query(
        `INSERT INTO admin_audit_log (admin_user_id, action, menu_item_id, menu_item_name, created_at)
         VALUES (NULL, 'menu_item.describe', ?, ?, UTC_TIMESTAMP(3))`,
        [update.id, update.name],
      )
    }
    await conn.commit()
    return { updated: plan.updates, conflicts: plan.conflicts, skipped: plan.skipped }
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  }
}
