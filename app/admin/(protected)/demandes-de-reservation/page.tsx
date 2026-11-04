import Link from 'next/link'
import { dbErrorCode, requireAdmin } from '@/lib/auth/dal'
import { getPool } from '@/lib/db'
import { formatDay, formatMonth, formatReceived } from '@/lib/site-reservations/report'
import { loadMonth } from '@/lib/site-reservations/store'

export const metadata = { title: 'Demandes de réservation' }

type PageProps = { searchParams: Promise<{ mois?: string | string[] }> }

const href = (month: string) => `/admin/demandes-de-reservation?mois=${month}`

export default async function ReservationRequestsPage({ searchParams }: PageProps) {
  await requireAdmin()
  const { mois } = await searchParams
  let data: Awaited<ReturnType<typeof loadMonth>>
  try {
    data = await loadMonth(getPool(), mois)
  } catch (error) {
    console.error(`[admin] site reservations failed: ${dbErrorCode(error)}`)
    return (
      <>
        <h1>Demandes de réservation</h1>
        <p role="alert" className="admin-alert">Les demandes de réservation sont momentanément inaccessibles. Réessayez dans un instant.</p>
      </>
    )
  }
  const { month, reservations, totalCovers, previous, next } = data

  return (
    <>
      <h1>Demandes de réservation</h1>
      <p className="admin-card admin-reservations-note">
        Demandes envoyées depuis le module DISH de ce site, classées par date du repas. Le restaurant les accepte ou les
        refuse dans DISH, et cette réponse n’apparaît pas ici, pas plus qu’une annulation ou une modification. Les
        demandes reçues par Google ou par téléphone n’y figurent pas : DISH reste la référence.
      </p>

      <nav className="admin-reservations-nav" aria-label="Mois">
        {previous ? <Link href={href(previous)} className="admin-button admin-button-small">← {formatMonth(previous)}</Link> : <span />}
        <h2>{formatMonth(month)}</h2>
        {next ? <Link href={href(next)} className="admin-button admin-button-small">{formatMonth(next)} →</Link> : <span />}
      </nav>

      <p className="admin-reservations-total" data-testid="month-total">
        <strong>{reservations.length}</strong> {reservations.length > 1 ? 'demandes' : 'demande'},{' '}
        <strong>{totalCovers}</strong> {totalCovers > 1 ? 'couverts' : 'couvert'}
      </p>

      {reservations.length > 0 && (
        <table className="admin-reservations-table">
          <thead>
            <tr>
              <th scope="col">Date du repas</th>
              <th scope="col">Heure</th>
              <th scope="col">Couverts</th>
              <th scope="col">Reçue le</th>
            </tr>
          </thead>
          <tbody>
            {reservations.map((r) => (
              <tr key={r.id} data-reservation={r.date}>
                <td>{formatDay(r.date)}</td>
                <td>{r.time}</td>
                <td>{r.covers}</td>
                <td>{formatReceived(r.receivedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
