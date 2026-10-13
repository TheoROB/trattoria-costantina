'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActionState, useRef, useState, type ChangeEvent } from 'react'
import type { ItemFormState } from '@/app/admin/menu-actions'
import type { AdminMenuItem } from '@/lib/menu/admin'
import type { FieldName } from '@/lib/menu/admin-input'
import { PHOTO_ACCEPT } from '@/lib/media/limits'
import { PREPARE_ERRORS } from '@/lib/media/messages'
import { preparePhoto } from '@/lib/media/prepare-photo'
import { MENU_CATEGORIES } from '@/lib/menu/categories'
import { centsToInput } from '@/lib/menu/price'

type Props = {
  action: (state: ItemFormState, formData: FormData) => Promise<ItemFormState>
  item?: AdminMenuItem
}

function FieldError({ field, errors }: { field: FieldName; errors?: ItemFormState['fieldErrors'] }) {
  const message = errors?.[field]
  return message ? <p className="admin-field-error" id={`item-${field}-error`}>{message}</p> : null
}

type PhotoStatus = { status: 'none' | 'preparing' | 'ready' } | { status: 'error'; message: string }

// Sent to the dedicated upload endpoint once the text fields are saved. On failure the item page shows
// why (?photo=<code>): the text changes are already saved at that point.
async function uploadPhoto(id: number, photo: Blob) {
  const body = new FormData()
  body.set('photo', photo, 'photo.jpg')
  try {
    const response = await fetch(`/api/admin/menu/${id}/photo`, { method: 'POST', body })
    if (response.ok) return null
    const { error } = await response.json().catch(() => ({ error: 'failed' }))
    return typeof error === 'string' ? error : 'failed'
  } catch {
    return 'failed'
  }
}

export function ItemForm({ action, item }: Props) {
  const router = useRouter()
  // The photo actually sent: the chosen file once oriented, resized and re-encoded by the browser.
  const preparedPhoto = useRef<Blob | null>(null)
  const preparation = useRef(0)
  const [photo, setPhoto] = useState<PhotoStatus>({ status: 'none' })

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    const run = ++preparation.current
    preparedPhoto.current = null
    input.setCustomValidity('')
    if (!file) return setPhoto({ status: 'none' })
    setPhoto({ status: 'preparing' })
    const result = await preparePhoto(file)
    // Another file was chosen in the meantime.
    if (run !== preparation.current) return
    if (result.ok) {
      preparedPhoto.current = result.blob
      setPhoto({ status: 'ready' })
    } else {
      // Blocks the submission until another photo is chosen or the field is cleared.
      input.setCustomValidity(PREPARE_ERRORS[result.error])
      setPhoto({ status: 'error', message: PREPARE_ERRORS[result.error] })
    }
  }

  const [state, formAction, pending] = useActionState(async (previous: ItemFormState, formData: FormData) => {
    // The file never goes through the Server Action (default 1 MB body limit).
    formData.delete('photo')
    const prepared = preparedPhoto.current
    if (prepared) formData.set('photoPending', '1')
    const result = await action(previous, formData)
    if (result.error) {
      // The form is shown again with an empty photo field.
      preparedPhoto.current = null
      setPhoto({ status: 'none' })
    }
    if (!prepared || result.error || !result.savedId) return result
    const error = await uploadPhoto(result.savedId, prepared)
    router.push(error ? `/admin/menu/${result.savedId}?photo=${encodeURIComponent(error)}` : '/admin')
    router.refresh()
    return result
  }, { error: null })
  const sent = state.values
  const errors = state.fieldErrors
  const describe = (field: FieldName) =>
    errors?.[field] ? { 'aria-invalid': true, 'aria-describedby': `item-${field}-error` } : {}

  return (
    // Remounted after a failed submission so that the typed values are shown again.
    <form key={JSON.stringify(sent ?? {})} action={formAction} className="admin-form admin-card">
      {state.error && <p role="alert" className="admin-alert">{state.error}</p>}
      {item && <input type="hidden" name="id" value={item.id} />}

      <div className="admin-field">
        <label htmlFor="item-category">Catégorie</label>
        <select id="item-category" name="category" required defaultValue={sent?.category ?? item?.categoryKey ?? ''} {...describe('category')}>
          <option value="" disabled>Choisir une catégorie</option>
          {MENU_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <FieldError field="category" errors={errors} />
      </div>

      <div className="admin-field">
        <label htmlFor="item-name">Nom</label>
        <input id="item-name" name="name" required maxLength={80} defaultValue={sent?.name ?? item?.name ?? ''} {...describe('name')} />
        <FieldError field="name" errors={errors} />
      </div>

      <div className="admin-field">
        <label htmlFor="item-description">Description</label>
        <textarea id="item-description" name="description" rows={3} maxLength={400} defaultValue={sent?.description ?? item?.description ?? ''} {...describe('description')} />
        <FieldError field="description" errors={errors} />
      </div>

      <div className="admin-field admin-field-price">
        <label htmlFor="item-price">Prix (€)</label>
        <input id="item-price" type="text" name="price" inputMode="decimal" required placeholder="12,50" maxLength={16}
          defaultValue={sent?.price ?? (item ? centsToInput(item.priceCents) : '')} {...describe('price')} />
        <FieldError field="price" errors={errors} />
      </div>

      <div className="admin-field">
        <label htmlFor="item-photo">{item?.imageKey ? 'Remplacer la photo' : 'Photo'} (facultatif)</label>
        <input id="item-photo" type="file" name="photo" accept={PHOTO_ACCEPT} onChange={choosePhoto}
          aria-describedby={photo.status === 'error' ? 'item-photo-error' : 'item-photo-hint'}
          aria-invalid={photo.status === 'error' || undefined} />
        <p className="admin-hint" id="item-photo-hint">
          Choisissez une photo depuis votre téléphone ou votre ordinateur. Elle sera automatiquement recadrée et optimisée.
        </p>
        <p className="admin-hint" aria-live="polite">
          {photo.status === 'preparing' && 'Préparation de la photo…'}
          {photo.status === 'ready' && 'Photo prête : elle sera enregistrée avec l’élément.'}
        </p>
        {photo.status === 'error' && <p className="admin-field-error" id="item-photo-error" role="alert">{photo.message}</p>}
      </div>

      <label className="admin-check">
        <input type="checkbox" name="isAvailable" defaultChecked={sent ? sent.isAvailable === 'on' : (item?.isAvailable ?? true)} />
        Disponible
      </label>
      <label className="admin-check">
        <input type="checkbox" name="isVisible" defaultChecked={sent ? sent.isVisible === 'on' : (item?.isVisible ?? true)} />
        Visible sur le site
      </label>

      <div className="admin-form-actions">
        <button type="submit" className="admin-button admin-button-primary" disabled={pending || photo.status === 'preparing'}>Enregistrer</button>
        <Link href="/admin" className="admin-button admin-button-ghost">Annuler</Link>
      </div>
    </form>
  )
}
