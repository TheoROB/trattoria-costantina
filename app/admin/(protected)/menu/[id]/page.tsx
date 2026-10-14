import { notFound } from 'next/navigation'
import { DeleteForm } from '@/components/admin/DeleteForm'
import { ItemForm } from '@/components/admin/ItemForm'
import { AdminMenuScreen, categoryHref, loadAdminMenu, pickCategory } from '@/components/admin/AdminMenuScreen'
import { removePhoto, updateItem } from '@/app/admin/menu-actions'
import { requireAdmin } from '@/lib/auth/dal'
import { getPool } from '@/lib/db'
import { getAdminMenuItem } from '@/lib/menu/admin'
import { parseItemId } from '@/lib/menu/admin-input'
import { isPhotoUploadError, PHOTO_ERRORS } from '@/lib/media/messages'
import { variantUrl } from '@/lib/media/storage'

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ photo?: string }> }

// Item editing, in the side panel over the list of its category.
export default async function EditMenuItemPage({ params, searchParams }: PageProps) {
  await requireAdmin()
  const { photo: photoError } = await searchParams
  const id = parseItemId((await params).id)
  const item = id ? await getAdminMenuItem(getPool(), id) : null
  if (!item) notFound()
  const categories = await loadAdminMenu()
  const active = categories ? pickCategory(categories, item.categoryKey) : undefined

  return (
    <AdminMenuScreen
      categories={categories}
      active={active}
      panel={{
        title: `Modifier « ${item.name} »`,
        content: (
          <>
            {isPhotoUploadError(photoError) && (
              <p role="alert" className="admin-alert" id="photo-upload-error">
                L’élément est enregistré, mais pas la photo. {PHOTO_ERRORS[photoError]}
              </p>
            )}
            {item.imageKey && (
              <section className="admin-photo">
                <img src={variantUrl(item.imageKey, 320)} width={96} height={96} alt={`Photo actuelle de ${item.name}`} />
                <form action={removePhoto}>
                  <input type="hidden" name="id" value={item.id} />
                  <button type="submit" className="admin-button admin-button-danger-ghost admin-button-small">Supprimer la photo</button>
                </form>
              </section>
            )}
            <ItemForm action={updateItem} item={item} cancelHref={active ? categoryHref(active.key) : '/admin'} />
            <section id="supprimer" className="admin-danger" aria-labelledby="supprimer-title">
              <h3 id="supprimer-title">Supprimer cet élément</h3>
              <p>La suppression est définitive. Pour le retirer temporairement de la carte, utilisez plutôt « Masquer ».</p>
              <DeleteForm id={item.id} />
            </section>
          </>
        ),
      }}
    />
  )
}
