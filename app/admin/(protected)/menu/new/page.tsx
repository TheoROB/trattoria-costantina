import Link from 'next/link'
import { ItemForm } from '@/components/admin/ItemForm'
import { createItem } from '@/app/admin/menu-actions'
import { requireAdmin } from '@/lib/auth/dal'

export default async function NewMenuItemPage() {
  await requireAdmin()
  return (
    <>
      <Link href="/admin" className="admin-back">← Retour à la carte</Link>
      <h1>Nouvel élément</h1>
      <ItemForm action={createItem} />
    </>
  )
}
