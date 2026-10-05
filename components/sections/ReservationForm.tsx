'use client'

import { useState, type FormEvent } from 'react'
import { CalendarIcon, ClockIcon } from '@/components/icons'

// Mockup behaviour kept as-is for Lot A; replaced by the DISH widget in Lot E.
export function ReservationForm() {
  const [submitted, setSubmitted] = useState(false)

  // Set on mount (as the mockup script did) to avoid a server/client date mismatch.
  const setMinToToday = (input: HTMLInputElement | null) => {
    if (input) input.min = new Date().toISOString().split('T')[0]
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div id="reservationSuccess" className="reservation-success">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
        <h4>Demande envoyée !</h4>
        <p>Nous vous contacterons rapidement pour confirmer votre réservation.</p>
      </div>
    )
  }

  return (
    <form id="reservationForm" onSubmit={onSubmit}>
      <div className="form-group">
        <label htmlFor="date">Date</label>
        <div className="input-with-icon">
          <CalendarIcon />
          <input type="date" id="date" name="date" ref={setMinToToday} required />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="heure">Heure</label>
          <div className="input-with-icon">
            <ClockIcon />
            <select id="heure" name="heure" required defaultValue="">
              <option value="">Heure</option>
              {['12:00', '12:30', '13:00', '13:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30'].map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="personnes">Personnes</label>
          <select id="personnes" name="personnes" required defaultValue="2 pers.">
            <option value="">Pers.</option>
            {['1 pers.', '2 pers.', '3 pers.', '4 pers.', '5 pers.', '6 pers.', '7+ pers.'].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>
      <button type="submit" className="btn btn-primary btn-full">Réserver une table</button>
      <p className="form-note">Réservation gratuite et sans frais</p>
    </form>
  )
}
