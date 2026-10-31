import Link from 'next/link'
import { dbErrorCode, requireAdmin } from '@/lib/auth/dal'
import { getPool } from '@/lib/db'
import { HOURLY_QUOTA, loadMonthReport } from '@/lib/reservation-requests/store'
import { formatDay, formatMonth, formatParisTime } from '@/lib/reservation-requests/paris-time'
import type { Period } from '@/lib/reservation-requests/report'

export const metadata = { title: 'Demandes de réservation' }

type PageProps = { searchParams: Promise<{ mois?: string | string[] }> }

const href = (month: string) => `/admin/demandes-de-reservation?mois=${month}`

function Value({ period }: { period: Period }) {
  if (period.status === 'unavailable') return <span className="admin-stat-muted">indisponible</span>
  if (period.status === 'future') return <span className="admin-stat-muted">—</span>
  return (
    <>
      {period.count}
      {period.partial && <span className="admin-stat-muted"> (partiel)</span>}
    </>
  )
}

export default async function ReservationRequestsPage({ searchParams }: PageProps) {
  await requireAdmin()
  const { mois } = await searchParams
  let data: Awaited<ReturnType<typeof loadMonthReport>>
  try {
    data = await loadMonthReport(getPool(), mois)
  } catch (error) {
    console.error(`[admin] reservation requests report failed: ${dbErrorCode(error)}`)
    return (
      <>
        <h1>Demandes de réservation</h1>
        <p role="alert" className="admin-alert">Les statistiques sont momentanément inaccessibles. Réessayez dans un instant.</p>
      </>
    )
  }
  const { activatedAt, report } = data
  const monthName = formatMonth(report.month)

  return (
    <>
      <h1>Demandes de réservation</h1>
      <section className="admin-card admin-stat-explain" aria-label="Définition">
        <p>
          Une <strong>demande de réservation</strong> est comptée chaque fois que le module de réservation DISH
          s’affiche réellement à l’écran d’un visiteur, sur ordinateur comme sur mobile : ouverture de la fenêtre
          « Réserver », ou module de la page d’accueil resté visible au moins une seconde. Fermer puis rouvrir compte à
          nouveau.
        </p>
        <p>
          Ce n’est <strong>ni un nombre de clics, ni un nombre de réservations</strong> (celles-ci sont dans DISH),
          <strong> ni un nombre de personnes</strong> : rien ne permet de reconnaître un visiteur (ni adresse IP, ni
          cookie, ni identifiant). Seuls l’heure et la page sont enregistrés.
        </p>
        <p>
          Jours en heure de Paris, semaines du lundi au dimanche. Comptage en service depuis le{' '}
          <strong>{formatParisTime(activatedAt)}</strong> : avant, aucune donnée n’existe (« indisponible », pas zéro).
          Au-delà de {HOURLY_QUOTA} ouvertures en une heure sur l’ensemble du site, les suivantes ne sont pas comptées.
        </p>
      </section>

      <nav className="admin-stat-nav" aria-label="Mois">
        {report.previous ? <Link href={href(report.previous)} className="admin-button admin-button-small">← {formatMonth(report.previous)}</Link> : <span />}
        <h2>{monthName}</h2>
        {report.next ? <Link href={href(report.next)} className="admin-button admin-button-small">{formatMonth(report.next)} →</Link> : <span />}
      </nav>

      <p className="admin-stat-total">
        Total du mois : <strong data-testid="month-total"><Value period={report} /></strong> demandes de réservation
      </p>

      <div className="admin-stat-tables">
        <table className="admin-stat-table">
          <caption>Par semaine (lundi → dimanche)</caption>
          <thead>
            <tr><th scope="col">Semaine</th><th scope="col">demandes de réservation</th></tr>
          </thead>
          <tbody>
            {report.weeks.map((week) => (
              <tr key={week.start} data-week={week.start}>
                <th scope="row">{formatDay(week.start)} → {formatDay(week.end)}</th>
                <td><Value period={week} /></td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="admin-stat-table">
          <caption>Par jour</caption>
          <thead>
            <tr><th scope="col">Jour</th><th scope="col">demandes de réservation</th></tr>
          </thead>
          <tbody>
            {report.days.map((day) => (
              <tr key={day.date} data-day={day.date}>
                <th scope="row">{formatDay(day.date)}</th>
                <td><Value period={day} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
