import Link from 'next/link'
import { moveItem, setFlag } from '@/app/admin/menu-actions'
import { dbErrorCode, requireAdmin } from '@/lib/auth/dal'
import { getPool } from '@/lib/db'
import { listAdminMenu, type AdminMenuCategory } from '@/lib/menu/admin'
import { formatPrice } from '@/lib/menu/format'

const ERRORS: Record<string, string> = {
  introuvable: 'Cet élément n’existe plus : il a peut-être été supprimé entre-temps.',
  echec: 'L’opération a échoué. Réessayez dans un instant.',
  invalide: 'Action invalide. Rechargez la page puis réessayez.',
}

function ItemButton({ action, fields, label, itemId, disabled }: {
  action: (formData: FormData) => Promise<void>
  fields: Record<string, string>
  label: string
  itemId: number
  disabled?: boolean
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={itemId} />
      {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <button type="submit" className="admin-button" disabled={disabled} aria-describedby={`item-${itemId}`}>{label}</button>
    </form>
  )
}

export default async function AdminMenuPage({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  await requireAdmin()
  const { erreur } = await searchParams
  let categories: AdminMenuCategory[] | null = null
  try {
    categories = await listAdminMenu(getPool())
  } catch (error) {
    console.error(`[admin] menu list failed: ${dbErrorCode(error)}`)
  }

  return (
    <>
      <div className="admin-toolbar">
        <h1>La carte</h1>
        <Link href="/admin/menu/new" className="admin-button admin-button-primary">Nouvel élément</Link>
      </div>
      {erreur && ERRORS[erreur] && <p role="alert" className="admin-alert">{ERRORS[erreur]}</p>}
      {!categories && <p role="alert" className="admin-alert">La carte est momentanément inaccessible. Réessayez dans un instant.</p>}

      {categories?.map((category) => (
        <section key={category.key} className="admin-category" aria-labelledby={`category-${category.key}`}>
          <h2 id={`category-${category.key}`}>{category.label}</h2>
          {category.items.length === 0 ? (
            <p className="admin-empty">Aucun élément.</p>
          ) : (
            <ol className="admin-items">
              {category.items.map((item, index) => (
                <li key={item.id} data-item-id={item.id} className={item.isVisible ? 'admin-item' : 'admin-item is-hidden'}>
                  <div className="admin-item-main">
                    <span className="admin-item-name" id={`item-${item.id}`}>{item.name}</span>
                    <span className="admin-item-price">{formatPrice(item.priceCents)}</span>
                  </div>
                  <div className="admin-item-meta">
                    <span>Position {index + 1}</span>
                    {!item.isVisible && <span className="admin-badge">Masqué</span>}
                    {!item.isAvailable && <span className="admin-badge">Indisponible</span>}
                  </div>
                  <div className="admin-item-actions">
                    <ItemButton action={moveItem} itemId={item.id} fields={{ direction: 'up' }} label="Monter" disabled={index === 0} />
                    <ItemButton action={moveItem} itemId={item.id} fields={{ direction: 'down' }} label="Descendre" disabled={index === category.items.length - 1} />
                    <ItemButton action={setFlag} itemId={item.id} fields={{ flag: 'visible', value: item.isVisible ? '0' : '1' }} label={item.isVisible ? 'Masquer' : 'Afficher'} />
                    <ItemButton action={setFlag} itemId={item.id} fields={{ flag: 'available', value: item.isAvailable ? '0' : '1' }} label={item.isAvailable ? 'Marquer indisponible' : 'Marquer disponible'} />
                    <Link href={`/admin/menu/${item.id}`} className="admin-button" aria-describedby={`item-${item.id}`}>Modifier</Link>
                    <Link href={`/admin/menu/${item.id}#supprimer`} className="admin-button admin-button-danger-ghost" aria-describedby={`item-${item.id}`}>Supprimer</Link>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}

      <section className="admin-card admin-reservations">
        <h2>Réservations</h2>
        <p>Les réservations sont gérées via DISH Reservation.</p>
      </section>
    </>
  )
}
