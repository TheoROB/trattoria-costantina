import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DeleteForm } from '@/components/admin/DeleteForm'
import { ItemForm } from '@/components/admin/ItemForm'
import { removePhoto, updateItem } from '@/app/admin/menu-actions'
import { requireAdmin } from '@/lib/auth/dal'
import { getPool } from '@/lib/db'
import { getAdminMenuItem } from '@/lib/menu/admin'
import { parseItemId } from '@/lib/menu/admin-input'
import { isPhotoUploadError, PHOTO_ERRORS } from '@/lib/media/messages'
import { variantUrl } from '@/lib/media/storage'

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ photo?: string }> }

export default async function EditMenuItemPage({ params, searchParams }: PageProps) {
  await requireAdmin()
  const { photo: photoError } = await searchParams
  const id = parseItemId((await params).id)
  const item = id ? await getAdminMenuItem(getPool(), id) : null
  if (!item) notFound()

  return (
    <>
      <Link href="/admin" className="admin-back">← Retour à la carte</Link>
      <h1>Modifier « {item.name} »</h1>
      {isPhotoUploadError(photoError) && (
        <p role="alert" className="admin-alert" id="photo-upload-error">
          L’élément est enregistré, mais pas la photo. {PHOTO_ERRORS[photoError]}
        </p>
      )}
      {item.imageKey && (
        <section className="admin-card admin-photo">
          <h2>Photo actuelle</h2>
          <img src={variantUrl(item.imageKey, 320)} width={160} height={160} alt={`Photo actuelle de ${item.name}`} />
          <form action={removePhoto}>
            <input type="hidden" name="id" value={item.id} />
            <button type="submit" className="admin-button admin-button-danger-ghost">Supprimer la photo</button>
          </form>
        </section>
      )}
      <ItemForm action={updateItem} item={item} />
      <section id="supprimer" className="admin-card admin-danger">
        <h2>Supprimer cet élément</h2>
        <p>La suppression est définitive. Pour le retirer temporairement de la carte, utilisez plutôt « Masquer ».</p>
        <DeleteForm id={item.id} />
      </section>
    </>
  )
}
