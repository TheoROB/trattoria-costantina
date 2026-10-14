'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, type ReactNode } from 'react'

// Side panel (full screen on phones) holding the item form over the list. A modal <dialog>: the list behind
// is inert, the focus stays inside, Escape closes it. Its address is a real page (/admin/menu/new,
// /admin/menu/<id>), so closing goes back to the list of the category.
export function AdminDrawer({ title, closeHref, children }: { title: string; closeHref: string; children: ReactNode }) {
  const router = useRouter()
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    // /admin/menu/<id>#supprimer: straight to the confirmation of the deletion.
    if (location.hash === '#supprimer') {
      const section = dialog.querySelector<HTMLElement>('#supprimer')
      section?.scrollIntoView({ block: 'start' })
      section?.querySelector<HTMLElement>('input[type="checkbox"]')?.focus()
    }
  }, [])

  return (
    <dialog
      ref={ref}
      className="admin-drawer"
      aria-labelledby="admin-drawer-title"
      onCancel={(event) => {
        event.preventDefault()
        router.push(closeHref)
      }}
    >
      <div className="admin-drawer-header">
        <h2 id="admin-drawer-title">{title}</h2>
        <Link href={closeHref} className="admin-button admin-button-ghost admin-button-small">Fermer</Link>
      </div>
      <div className="admin-drawer-body">{children}</div>
    </dialog>
  )
}
