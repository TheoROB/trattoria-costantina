'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarIcon } from '@/components/icons'
import { DishWidget } from '@/components/sections/DishWidget'
import './reservation-cta.css'

// Floating "Réserver" button on every public page, opening the DISH widget in a native modal <dialog>
// (top layer, inert background, Escape). `hidden` lets the navbar hide it while its mobile menu is open.
export function ReservationCta({ hidden = false }: { hidden?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  // The iframe is only mounted on the first opening, then kept so a booking in progress survives a close.
  const [loaded, setLoaded] = useState(false)
  const [sectionInView, setSectionInView] = useState(false)

  // On the home page the reservation section already shows the widget: no duplicate button over it.
  useEffect(() => {
    const section = document.getElementById('reservation')
    if (!section) return
    const observer = new IntersectionObserver(([entry]) => setSectionInView(entry.isIntersecting))
    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  const open = () => {
    setLoaded(true)
    dialogRef.current?.showModal()
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={hidden || sectionInView ? 'btn btn-primary reservation-cta is-hidden' : 'btn btn-primary reservation-cta'}
        aria-label="Réserver une table"
        aria-haspopup="dialog"
        aria-controls="reservation-cta-dialog"
        onClick={open}
      >
        <CalendarIcon size={18} strokeWidth={1.75} />
        Réserver
      </button>

      <dialog
        ref={dialogRef}
        id="reservation-cta-dialog"
        className="reservation-cta-dialog"
        aria-labelledby="reservation-cta-title"
        onClose={() => triggerRef.current?.focus()}
        // A click on the backdrop lands on the <dialog> itself.
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close() }}
      >
        <div className="reservation-cta-panel">
          <div className="reservation-cta-header">
            <h2 id="reservation-cta-title">Réserver une table</h2>
            <button type="button" className="reservation-cta-close" aria-label="Fermer" onClick={() => dialogRef.current?.close()}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </div>
          {loaded && <DishWidget />}
        </div>
      </dialog>
    </>
  )
}
