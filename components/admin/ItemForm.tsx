'use client'

import Link from 'next/link'
import { useActionState, type ChangeEvent } from 'react'
import type { FormFieldName as FieldName, ItemFormState } from '@/app/admin/menu-actions'
import type { AdminMenuItem } from '@/lib/menu/admin'
import { MAX_UPLOAD_BYTES, PHOTO_ACCEPT } from '@/lib/media/limits'
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

// Checked again on the server; here it only avoids sending a file the server would refuse.
function checkPhotoSize(event: ChangeEvent<HTMLInputElement>) {
  const input = event.currentTarget
  const file = input.files?.[0]
  input.setCustomValidity(file && file.size > MAX_UPLOAD_BYTES ? 'La photo dépasse 10 Mo : choisissez une image plus légère.' : '')
  input.reportValidity()
}

export function ItemForm({ action, item }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null })
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
        <input id="item-photo" type="file" name="photo" accept={PHOTO_ACCEPT} onChange={checkPhotoSize}
          aria-describedby={errors?.photo ? 'item-photo-error item-photo-hint' : 'item-photo-hint'} aria-invalid={errors?.photo ? true : undefined} />
        <p className="admin-hint" id="item-photo-hint">JPEG, PNG ou WebP, 10 Mo maximum, au moins 320 × 320 pixels. La photo est recadrée en carré.</p>
        <FieldError field="photo" errors={errors} />
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
        <button type="submit" className="admin-button admin-button-primary" disabled={pending}>Enregistrer</button>
        <Link href="/admin" className="admin-button admin-button-ghost">Annuler</Link>
      </div>
    </form>
  )
}
