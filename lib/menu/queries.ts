import 'server-only'
import type mysql from 'mysql2/promise'
import { getPool } from '@/lib/db'
import { isMenuCategoryKey } from './categories'
import { groupByCategory, type MenuCategoryGroup, type PublicMenuItem } from './menu'

export type PublicMenu = { status: 'ok'; categories: MenuCategoryGroup[] } | { status: 'unavailable' }

export async function readPublicMenu(pool: mysql.Pool): Promise<PublicMenu> {
  try {
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT id, category_key, name, description, price_cents, image_key, is_available
         FROM menu_items
        WHERE is_visible = 1
        ORDER BY position, id`,
    )
    const items: PublicMenuItem[] = rows
      .filter((r) => isMenuCategoryKey(r.category_key))
      .map((r) => ({
        id: r.id,
        categoryKey: r.category_key,
        name: r.name,
        description: r.description,
        priceCents: r.price_cents,
        imageKey: r.image_key,
        isAvailable: r.is_available === 1,
      }))
    return { status: 'ok', categories: groupByCategory(items) }
  } catch (error) {
    // Log the driver error code only: messages can contain connection details.
    console.error(`[menu] public menu unavailable: ${(error as { code?: string }).code ?? 'unknown error'}`)
    return { status: 'unavailable' }
  }
}

export async function getPublicMenu(): Promise<PublicMenu> {
  let pool: mysql.Pool
  try {
    pool = getPool()
  } catch {
    console.error('[menu] public menu unavailable: DATABASE_URL is not set')
    return { status: 'unavailable' }
  }
  return readPublicMenu(pool)
}
