'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition, type DragEvent } from 'react'
import { moveItem, reorderItem, setFlag, type ListActionResult } from '@/app/admin/menu-actions'
import { formatPrice } from '@/lib/menu/format'

export type ListItem = {
  id: number
  name: string
  priceCents: number
  thumbUrl: string | null
  isAvailable: boolean
  isVisible: boolean
}

type Flag = 'available' | 'visible'
type Notice = { kind: 'ok' | 'pending' | 'error'; text: string } | null
type Rollback = ListItem[] | ((list: ListItem[]) => ListItem[])

const ERRORS: Record<Exclude<ListActionResult, 'ok'>, string> = {
  not_found: 'Cet élément n’existe plus : il a peut-être été supprimé entre-temps.',
  failed: 'La modification n’a pas pu être enregistrée. Réessayez dans un instant.',
  invalid: 'Action invalide. Rechargez la page puis réessayez.',
}

const fields = (values: Record<string, string | number>) => {
  const data = new FormData()
  for (const [name, value] of Object.entries(values)) data.set(name, String(value))
  return data
}

const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

// One category of the admin menu as a dense list. Availability, visibility and order change at once on
// screen, are saved by the existing Server Actions, and roll back with a message if saving fails.
// A navigation started while a change is being saved would discard the Server Action on the client (its
// result never comes back) or, for a full page load, abort the request: admin links and forms used meanwhile
// wait for the saves to finish, and only go on if they all succeeded.
export function AdminItemList({ items }: { items: ListItem[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  // The server list, and what is shown (the server list plus changes being saved).
  const [source, setSource] = useState(items)
  const [shown, setShown] = useState(items)
  if (source !== items) {
    setSource(items)
    setShown(items)
  }
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  // Changes being saved, by key: kept outside React state so a double click is caught at once.
  const inFlight = useRef(new Set<string>())
  const failed = useRef(false)
  // A link or form used while saving, run once every save has succeeded.
  const deferred = useRef<(() => void) | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const dragFrom = useRef<number | null>(null)
  const dropped = useRef(false)
  // Keeps the keyboard focus on the button used to move an item once the list has been reordered.
  const refocus = useRef<{ id: number; direction: 'up' | 'down' } | null>(null)
  const listRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const target = refocus.current
    if (!target) return
    refocus.current = null
    const row = listRef.current?.querySelector(`[data-item-id="${target.id}"]`)
    const button = row?.querySelector<HTMLButtonElement>(`[data-move="${target.direction}"]`)
    ;(button && !button.disabled ? button : row?.querySelector<HTMLElement>('[data-move]:not(:disabled)'))?.focus()
  })

  useEffect(() => {
    const leaving = (go: () => void) => {
      deferred.current = go
      setNotice({ kind: 'pending', text: 'Enregistrement en cours…' })
    }
    function onClick(event: MouseEvent) {
      if (inFlight.current.size === 0 || event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(link instanceof HTMLAnchorElement) || link.origin !== location.origin || link.hasAttribute('download')) return
      if (link.target && link.target !== '_self') return
      // Before the Next.js link handler (captured on the document, which comes first).
      event.preventDefault()
      event.stopPropagation()
      const href = link.pathname + link.search + link.hash
      leaving(() => router.push(href))
    }
    function onSubmit(event: SubmitEvent) {
      if (inFlight.current.size === 0 || !(event.target instanceof HTMLFormElement)) return
      event.preventDefault()
      event.stopPropagation()
      const form = event.target
      const submitter = event.submitter
      leaving(() => form.requestSubmit(submitter))
    }
    // Closing or reloading the tab: the browser asks for confirmation.
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (inFlight.current.size > 0) event.preventDefault()
    }
    document.addEventListener('click', onClick, true)
    document.addEventListener('submit', onSubmit, true)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('submit', onSubmit, true)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [router])

  function save(key: string, run: () => Promise<ListActionResult>, rollback: Rollback, success: string) {
    inFlight.current.add(key)
    setBusy((b) => ({ ...b, [key]: true }))
    if (!deferred.current) setNotice(null)
    startTransition(async () => {
      const result = await run().catch((): ListActionResult => 'failed')
      inFlight.current.delete(key)
      setBusy((b) => Object.fromEntries(Object.entries(b).filter(([k]) => k !== key)))
      if (result === 'ok') {
        if (!deferred.current) setNotice({ kind: 'ok', text: success })
      } else {
        failed.current = true
        setShown(rollback)
        setNotice({ kind: 'error', text: ERRORS[result] })
      }
      if (inFlight.current.size > 0) return
      // All saved: run the navigation asked for meanwhile, unless a save failed (its message must be seen).
      const go = deferred.current
      deferred.current = null
      const ok = !failed.current
      failed.current = false
      if (go && ok) go()
      else router.refresh()
    })
  }

  function toggle(item: ListItem, flag: Flag) {
    const key = `${item.id}:${flag}`
    if (inFlight.current.has(key)) return
    const value = flag === 'available' ? !item.isAvailable : !item.isVisible
    const set = (v: boolean) => (list: ListItem[]) =>
      list.map((i) => (i.id !== item.id ? i : flag === 'available' ? { ...i, isAvailable: v } : { ...i, isVisible: v }))
    setShown(set(value))
    const state = flag === 'available' ? (value ? 'disponible' : 'indisponible') : value ? 'visible' : 'masqué'
    // Rolls back this flag only, not changes made meanwhile on other rows.
    save(key, () => setFlag(fields({ id: item.id, flag, value: value ? 1 : 0 })), set(!value), `« ${item.name} » : ${state}.`)
  }

  function step(item: ListItem, direction: 'up' | 'down') {
    if (inFlight.current.has(`${item.id}:move`)) return
    const from = shown.findIndex((i) => i.id === item.id)
    const to = direction === 'up' ? from - 1 : from + 1
    if (to < 0 || to >= shown.length) return
    refocus.current = { id: item.id, direction }
    const rollback = shown
    setShown(move(shown, from, to))
    save(`${item.id}:move`, () => moveItem(fields({ id: item.id, direction })), rollback, `« ${item.name} » est maintenant en position ${to + 1}.`)
  }

  // Drag and drop (pointer devices), from the handle. The list follows the pointer; the new position is saved
  // on drop and the move is undone if the drag is cancelled.
  function onDragStart(event: DragEvent<HTMLElement>, item: ListItem) {
    setDragging(item.id)
    dragFrom.current = shown.findIndex((i) => i.id === item.id)
    dropped.current = false
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(item.id))
    const row = event.currentTarget.closest('li')
    if (row) event.dataTransfer.setDragImage(row, 24, 24)
  }

  function onDragOver(event: DragEvent<HTMLLIElement>, over: ListItem) {
    if (dragging === null) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const from = shown.findIndex((i) => i.id === dragging)
    const to = shown.findIndex((i) => i.id === over.id)
    if (from !== to) setShown(move(shown, from, to))
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    const item = shown.find((i) => i.id === dragging)
    const from = dragFrom.current
    const to = shown.findIndex((i) => i.id === dragging)
    dropped.current = true
    if (!item || from === null || from === to) return
    save(`${item.id}:move`, () => reorderItem(fields({ id: item.id, position: to })), move(shown, to, from), `« ${item.name} » est maintenant en position ${to + 1}.`)
  }

  function onDragEnd() {
    if (!dropped.current && dragFrom.current !== null && dragging !== null) {
      const now = shown.findIndex((i) => i.id === dragging)
      setShown(move(shown, now, dragFrom.current))
    }
    dragFrom.current = null
    setDragging(null)
  }

  return (
    <>
      <p className={notice?.kind === 'error' ? 'admin-list-notice is-error' : 'admin-list-notice'} aria-live="polite">
        {notice && notice.kind !== 'error' && notice.text}
      </p>
      {notice?.kind === 'error' && <p role="alert" className="admin-alert">{notice.text}</p>}
      {shown.length === 0 ? (
        <p className="admin-empty">Aucun élément dans cette catégorie.</p>
      ) : (
        <ol
          ref={listRef}
          className="admin-rows"
          // Dropping between two rows counts too.
          onDragOver={(event) => dragging !== null && event.preventDefault()}
          onDrop={onDrop}
        >
          {shown.map((item, index) => {
            const classes = ['admin-row', !item.isVisible && 'is-hidden', !item.isAvailable && 'is-unavailable', dragging === item.id && 'is-dragging']
            return (
              <li
                key={item.id}
                data-item-id={item.id}
                className={classes.filter(Boolean).join(' ')}
                onDragOver={(event) => onDragOver(event, item)}
                onDragEnd={onDragEnd}
              >
                <span
                  className="admin-row-handle"
                  title="Glisser pour réorganiser"
                  aria-hidden="true"
                  draggable
                  onDragStart={(event) => onDragStart(event, item)}
                />
                {item.thumbUrl ? (
                  <img className="admin-row-thumb" src={item.thumbUrl} width={40} height={40} alt="" />
                ) : (
                  <span className="admin-row-thumb is-empty" aria-hidden="true" />
                )}
                <span className="admin-row-main">
                  <span className="admin-item-name" id={`item-${item.id}`}>{item.name}</span>
                  <span className="admin-item-price">{formatPrice(item.priceCents)}</span>
                </span>
                <span className="admin-row-status">
                  <button
                    type="button"
                    className={item.isAvailable ? 'admin-status is-on' : 'admin-status is-off'}
                    aria-label={item.isAvailable ? 'Disponible. Marquer indisponible' : 'Indisponible. Marquer disponible'}
                    aria-describedby={`item-${item.id}`}
                    // Busy, not disabled: the focus stays on the button while saving.
                    aria-disabled={busy[`${item.id}:available`] || undefined}
                    aria-busy={busy[`${item.id}:available`] || undefined}
                    onClick={() => toggle(item, 'available')}
                  >
                    {item.isAvailable ? 'Disponible' : 'Indisponible'}
                  </button>
                  <button
                    type="button"
                    className={item.isVisible ? 'admin-status is-on' : 'admin-status is-off'}
                    aria-label={item.isVisible ? 'Visible. Masquer' : 'Masqué. Afficher'}
                    aria-describedby={`item-${item.id}`}
                    aria-disabled={busy[`${item.id}:visible`] || undefined}
                    aria-busy={busy[`${item.id}:visible`] || undefined}
                    onClick={() => toggle(item, 'visible')}
                  >
                    {item.isVisible ? 'Visible' : 'Masqué'}
                  </button>
                </span>
                <span className="admin-row-moves">
                  <button
                    type="button"
                    className="admin-icon-button"
                    data-move="up"
                    aria-label="Monter"
                    aria-describedby={`item-${item.id}`}
                    disabled={index === 0}
                    aria-disabled={busy[`${item.id}:move`] || undefined}
                    onClick={() => step(item, 'up')}
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button
                    type="button"
                    className="admin-icon-button"
                    data-move="down"
                    aria-label="Descendre"
                    aria-describedby={`item-${item.id}`}
                    disabled={index === shown.length - 1}
                    aria-disabled={busy[`${item.id}:move`] || undefined}
                    onClick={() => step(item, 'down')}
                  >
                    <span aria-hidden="true">↓</span>
                  </button>
                </span>
                <span className="admin-row-actions">
                  <Link href={`/admin/menu/${item.id}`} className="admin-button admin-button-small" aria-describedby={`item-${item.id}`}>
                    Modifier
                  </Link>
                  {/* Phones: deletion stays in the edit panel, the row has no room for it. */}
                  <Link
                    href={`/admin/menu/${item.id}#supprimer`}
                    className="admin-button admin-button-small admin-button-danger-ghost admin-row-delete"
                    aria-describedby={`item-${item.id}`}
                  >
                    Supprimer
                  </Link>
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </>
  )
}
