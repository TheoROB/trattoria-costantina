'use client'

import { useActionState } from 'react'
import { deleteItem, type ItemFormState } from '@/app/admin/menu-actions'

export function DeleteForm({ id }: { id: number }) {
  const [state, action, pending] = useActionState<ItemFormState, FormData>(deleteItem, { error: null })
  return (
    <form action={action} className="admin-form">
      {state.error && <p role="alert" className="admin-alert">{state.error}</p>}
      <input type="hidden" name="id" value={id} />
      <label className="admin-check">
        <input type="checkbox" name="confirm" required />
        Je confirme la suppression
      </label>
      <div className="admin-form-actions">
        <button type="submit" className="admin-button admin-button-danger" disabled={pending}>Supprimer définitivement</button>
      </div>
    </form>
  )
}
