import 'server-only'
import type mysql from 'mysql2/promise'
import { MENU_CATEGORIES, isMenuCategoryKey, type MenuCategoryKey } from './categories'
import type { MenuItemInput } from './admin-input'

export type AdminMenuItem = MenuItemInput & { id: number; position: number; imageKey: string | null }
export type AdminMenuCategory = { key: MenuCategoryKey; label: string; items: AdminMenuItem[] }
export type MutationResult = 'ok' | 'not_found'
// removedImageKey: photo no longer referenced once the transaction has committed (its files can go).
export type PhotoMutationResult = { status: 'not_found' } | { status: 'ok'; removedImageKey: string | null }
export type AuditAction =
  | 'menu_item.create'
  | 'menu_item.update'
  | 'menu_item.delete'
  | 'menu_item.set_available'
  | 'menu_item.set_visible'
  | 'menu_item.move'
  | 'menu_item.photo_add'
  | 'menu_item.photo_replace'
  | 'menu_item.photo_delete'

const COLUMNS = 'id, category_key, name, description, price_cents, image_key, is_available, is_visible, position'

function toItem(row: mysql.RowDataPacket): AdminMenuItem {
  return {
    id: row.id,
    categoryKey: row.category_key,
    name: row.name,
    description: row.description,
    priceCents: row.price_cents,
    imageKey: row.image_key,
    isAvailable: row.is_available === 1,
    isVisible: row.is_visible === 1,
    position: row.position,
  }
}

const LOCK_ERRORS = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'])

async function withTransaction<T>(pool: mysql.Pool, work: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const result = await work(conn)
      await conn.commit()
      return result
    } catch (error) {
      await conn.rollback().catch(() => {})
      if (attempt < 3 && LOCK_ERRORS.has((error as { code?: string }).code ?? '')) continue
      throw error
    } finally {
      conn.release()
    }
  }
}

export async function writeAudit(
  conn: mysql.PoolConnection | mysql.Pool,
  entry: { adminUserId: number; action: AuditAction | 'auth.login' | 'auth.logout'; menuItemId?: number; menuItemName?: string },
) {
  await conn.query(
    `INSERT INTO admin_audit_log (admin_user_id, action, menu_item_id, menu_item_name, created_at)
     VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))`,
    [entry.adminUserId, entry.action, entry.menuItemId ?? null, entry.menuItemName ?? null],
  )
}

// Locks the category's rows (in a stable order) and rewrites positions as 0..n-1 in `ids` order.
async function lockCategory(conn: mysql.PoolConnection, categoryKey: string) {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    'SELECT id, position FROM menu_items WHERE category_key = ? ORDER BY position, id FOR UPDATE',
    [categoryKey],
  )
  return rows as { id: number; position: number }[]
}

async function writePositions(conn: mysql.PoolConnection, current: { id: number; position: number }[], ids: number[]) {
  const before = new Map(current.map((r) => [r.id, r.position]))
  for (const [index, id] of ids.entries()) {
    if (before.get(id) !== index) await conn.query('UPDATE menu_items SET position = ? WHERE id = ?', [index, id])
  }
}

async function lockItem(conn: mysql.PoolConnection, id: number) {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(`SELECT ${COLUMNS} FROM menu_items WHERE id = ? FOR UPDATE`, [id])
  return rows[0] ? toItem(rows[0]) : null
}

export async function listAdminMenu(pool: mysql.Pool): Promise<AdminMenuCategory[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(`SELECT ${COLUMNS} FROM menu_items ORDER BY position, id`)
  const items = rows.filter((r) => isMenuCategoryKey(r.category_key)).map(toItem)
  return MENU_CATEGORIES.map(({ key, label }) => ({ key, label, items: items.filter((i) => i.categoryKey === key) }))
}

export async function getAdminMenuItem(pool: mysql.Pool, id: number) {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(`SELECT ${COLUMNS} FROM menu_items WHERE id = ?`, [id])
  return rows[0] ? toItem(rows[0]) : null
}

const fields = (input: MenuItemInput) => ({
  category_key: input.categoryKey,
  name: input.name,
  description: input.description,
  price_cents: input.priceCents,
  is_available: input.isAvailable ? 1 : 0,
  is_visible: input.isVisible ? 1 : 0,
})

export function createMenuItem(pool: mysql.Pool, adminUserId: number, input: MenuItemInput) {
  return withTransaction(pool, async (conn) => {
    const rows = await lockCategory(conn, input.categoryKey)
    const [result] = await conn.query<mysql.ResultSetHeader>('INSERT INTO menu_items SET ?', [
      { ...fields(input), position: rows.length },
    ])
    await writePositions(conn, rows, rows.map((r) => r.id))
    await writeAudit(conn, { adminUserId, action: 'menu_item.create', menuItemId: result.insertId, menuItemName: input.name })
    return { id: result.insertId }
  })
}

async function setPhoto(conn: mysql.PoolConnection, adminUserId: number, item: AdminMenuItem, imageKey: string | null) {
  await conn.query('UPDATE menu_items SET image_key = ? WHERE id = ?', [imageKey, item.id])
  const action = !imageKey ? 'menu_item.photo_delete' : item.imageKey ? 'menu_item.photo_replace' : 'menu_item.photo_add'
  await writeAudit(conn, { adminUserId, action, menuItemId: item.id, menuItemName: item.name })
}

export function updateMenuItem(pool: mysql.Pool, adminUserId: number, id: number, input: MenuItemInput): Promise<MutationResult> {
  return withTransaction(pool, async (conn) => {
    const item = await lockItem(conn, id)
    if (!item) return 'not_found'
    if (item.categoryKey === input.categoryKey) {
      await conn.query('UPDATE menu_items SET ? WHERE id = ?', [fields(input), id])
    } else {
      const source = await lockCategory(conn, item.categoryKey)
      const target = await lockCategory(conn, input.categoryKey)
      await conn.query('UPDATE menu_items SET ? WHERE id = ?', [{ ...fields(input), position: target.length }, id])
      await writePositions(conn, source, source.map((r) => r.id).filter((rowId) => rowId !== id))
      await writePositions(conn, target, target.map((r) => r.id))
    }
    await writeAudit(conn, { adminUserId, action: 'menu_item.update', menuItemId: id, menuItemName: input.name })
    return 'ok'
  })
}

// The new photo's files must already be written: the key is only referenced once they exist.
export function setMenuItemPhoto(pool: mysql.Pool, adminUserId: number, id: number, imageKey: string): Promise<PhotoMutationResult> {
  return withTransaction(pool, async (conn) => {
    const item = await lockItem(conn, id)
    if (!item) return { status: 'not_found' }
    await setPhoto(conn, adminUserId, item, imageKey)
    return { status: 'ok', removedImageKey: item.imageKey }
  })
}

export function removeMenuItemPhoto(pool: mysql.Pool, adminUserId: number, id: number): Promise<PhotoMutationResult> {
  return withTransaction(pool, async (conn) => {
    const item = await lockItem(conn, id)
    if (!item) return { status: 'not_found' }
    if (item.imageKey) await setPhoto(conn, adminUserId, item, null)
    return { status: 'ok', removedImageKey: item.imageKey }
  })
}

export function deleteMenuItem(pool: mysql.Pool, adminUserId: number, id: number): Promise<PhotoMutationResult> {
  return withTransaction(pool, async (conn) => {
    const item = await lockItem(conn, id)
    if (!item) return { status: 'not_found' }
    const rows = await lockCategory(conn, item.categoryKey)
    await conn.query('DELETE FROM menu_items WHERE id = ?', [id])
    await writePositions(conn, rows, rows.map((r) => r.id).filter((rowId) => rowId !== id))
    await writeAudit(conn, { adminUserId, action: 'menu_item.delete', menuItemId: id, menuItemName: item.name })
    return { status: 'ok', removedImageKey: item.imageKey }
  })
}

export async function referencedImageKeys(pool: mysql.Pool, keys: string[]) {
  if (keys.length === 0) return new Set<string>()
  const [rows] = await pool.query<mysql.RowDataPacket[]>('SELECT image_key FROM menu_items WHERE image_key IN (?)', [keys])
  return new Set(rows.map((r) => r.image_key as string))
}

export function setMenuItemFlag(
  pool: mysql.Pool,
  adminUserId: number,
  id: number,
  flag: 'available' | 'visible',
  value: boolean,
): Promise<MutationResult> {
  const column = flag === 'available' ? 'is_available' : 'is_visible'
  return withTransaction(pool, async (conn) => {
    const item = await lockItem(conn, id)
    if (!item) return 'not_found'
    await conn.query(`UPDATE menu_items SET ${column} = ? WHERE id = ?`, [value ? 1 : 0, id])
    await writeAudit(conn, { adminUserId, action: `menu_item.set_${flag}`, menuItemId: id, menuItemName: item.name })
    return 'ok'
  })
}

export function moveMenuItem(pool: mysql.Pool, adminUserId: number, id: number, direction: 'up' | 'down'): Promise<MutationResult> {
  return withTransaction(pool, async (conn) => {
    const item = await lockItem(conn, id)
    if (!item) return 'not_found'
    const rows = await lockCategory(conn, item.categoryKey)
    const ids = rows.map((r) => r.id)
    const from = ids.indexOf(id)
    const to = direction === 'up' ? from - 1 : from + 1
    if (to >= 0 && to < ids.length) {
      ;[ids[from], ids[to]] = [ids[to], ids[from]]
      await writeAudit(conn, { adminUserId, action: 'menu_item.move', menuItemId: id, menuItemName: item.name })
    }
    await writePositions(conn, rows, ids)
    return 'ok'
  })
}
