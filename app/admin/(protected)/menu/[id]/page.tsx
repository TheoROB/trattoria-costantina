import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DeleteForm } from '@/components/admin/DeleteForm'
import { ItemForm } from '@/components/admin/ItemForm'
import { updateItem } from '@/app/admin/menu-actions'
import { requireAdmin } from '@/lib/auth/dal'
import { getPool } from '@/lib/db'
import { getAdminMenuItem } from '@/lib/menu/admin'
import { parseItemId } from '@/lib/menu/admin-input'

export default async function EditMenuItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const id = parseItemId((await params).id)
  const item = id ? await getAdminMenuItem(getPool(), id) : null
  if (!item) notFound()

  return (
    <>
      <Link href="/admin" className="admin-back">← Retour à la carte</Link>
      <h1>Modifier « {item.name} »</h1>
      <ItemForm action={updateItem} item={item} />
      <section id="supprimer" className="admin-card admin-danger">
        <h2>Supprimer cet élément</h2>
        <p>La suppression est définitive. Pour le retirer temporairement de la carte, utilisez plutôt « Masquer ».</p>
        <DeleteForm id={item.id} />
      </section>
    </>
  )
}
