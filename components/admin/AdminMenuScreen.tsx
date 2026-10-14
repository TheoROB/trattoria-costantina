import Link from 'next/link'
import type { ReactNode } from 'react'
import { dbErrorCode } from '@/lib/auth/dal'
import { getPool } from '@/lib/db'
import { variantUrl } from '@/lib/media/storage'
import { listAdminMenu, type AdminMenuCategory } from '@/lib/menu/admin'
import { AdminCategoryNav } from './AdminCategoryNav'
import { AdminDrawer } from './AdminDrawer'
import { AdminItemList } from './AdminItemList'

const ERRORS: Record<string, string> = {
  introuvable: 'Cet élément n’existe plus : il a peut-être été supprimé entre-temps.',
  echec: 'L’opération a échoué. Réessayez dans un instant.',
  invalide: 'Action invalide. Rechargez la page puis réessayez.',
}

export const categoryHref = (key: string) => `/admin?categorie=${key}`

export async function loadAdminMenu() {
  try {
    return await listAdminMenu(getPool())
  } catch (error) {
    console.error(`[admin] menu list failed: ${dbErrorCode(error)}`)
    return null
  }
}

// The category asked for, else the first one holding items, else the first one.
export function pickCategory(categories: AdminMenuCategory[], requested?: string) {
  return categories.find((c) => c.key === requested) ?? categories.find((c) => c.items.length > 0) ?? categories[0]
}

type Props = {
  categories: AdminMenuCategory[] | null
  active?: AdminMenuCategory
  error?: string
  // Item form shown in a side panel over the list (/admin/menu/new, /admin/menu/<id>).
  panel?: { title: string; content: ReactNode }
}

// Menu management: category tabs, then the items of one category as a dense list.
export function AdminMenuScreen({ categories, active, error, panel }: Props) {
  const label = (category: AdminMenuCategory) => (category.legacy ? `${category.label} (à reclasser)` : category.label)
  return (
    <>
      <div className="admin-toolbar">
        <h1>La carte</h1>
        {active && (
          <Link href={`/admin/menu/new?categorie=${active.key}`} className="admin-button admin-button-primary">
            + Ajouter un élément
          </Link>
        )}
      </div>
      {error && ERRORS[error] && <p role="alert" className="admin-alert">{ERRORS[error]}</p>}
      {!categories && <p role="alert" className="admin-alert">La carte est momentanément inaccessible. Réessayez dans un instant.</p>}

      {categories && active && (
        <>
          <AdminCategoryNav
            categories={categories.map((c) => ({ key: c.key, label: label(c), count: c.items.length }))}
            active={active.key}
          />
          <section className="admin-category" aria-labelledby={`category-${active.key}`}>
            <div className="admin-category-header">
              <h2 id={`category-${active.key}`}>{label(active)}</h2>
              <span className="admin-category-count">
                {active.items.length} élément{active.items.length > 1 ? 's' : ''}
              </span>
            </div>
            {active.legacy && (
              <p className="admin-hint">Cette catégorie n’existe plus. Modifiez chaque élément pour lui choisir sa nouvelle catégorie.</p>
            )}
            <AdminItemList
              key={active.key}
              items={active.items.map((item) => ({
                id: item.id,
                name: item.name,
                priceCents: item.priceCents,
                thumbUrl: item.imageKey ? variantUrl(item.imageKey, 160) : null,
                isAvailable: item.isAvailable,
                isVisible: item.isVisible,
              }))}
            />
          </section>
        </>
      )}

      <section className="admin-card admin-reservations">
        <h2>Réservations</h2>
        <p>Les réservations sont gérées via DISH Reservation.</p>
      </section>

      {panel && (
        <AdminDrawer title={panel.title} closeHref={active ? categoryHref(active.key) : '/admin'}>
          {panel.content}
        </AdminDrawer>
      )}
    </>
  )
}
