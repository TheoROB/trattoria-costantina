import Link from 'next/link'
import { dbErrorCode } from '@/lib/auth/dal'
import { getPool } from '@/lib/db'
import { formatDay, formatMonth } from '@/lib/reservation-requests/paris-time'
import type { Period } from '@/lib/reservation-requests/report'
import { loadSummary } from '@/lib/reservation-requests/store'

export const REPORT_HREF = '/admin/demandes-de-reservation'

// A count, "indisponible" before counting started (never zero), "—" for days to come.
export function PeriodValue({ period }: { period: Period }) {
  if (period.status === 'unavailable') return <span className="admin-stat-muted">indisponible</span>
  if (period.status === 'future') return <span className="admin-stat-muted">—</span>
  return (
    <>
      {period.count}
      {period.partial && <span className="admin-stat-muted"> (partiel)</span>}
    </>
  )
}

// Card on the admin home page. A database problem (or the 0006 migration not applied yet) only hides the figures:
// the menu below keeps working.
export async function ReservationRequestsSummary() {
  let data: Awaited<ReturnType<typeof loadSummary>> | null = null
  try {
    data = await loadSummary(getPool())
  } catch (error) {
    console.error(`[admin] reservation requests summary failed: ${dbErrorCode(error)}`)
  }
  return (
    <section className="admin-card admin-stat-summary" aria-labelledby="reservation-requests-summary-title">
      <h2 id="reservation-requests-summary-title">Demandes de réservation</h2>
      {data ? (
        <dl className="admin-stat-summary-figures">
          <div data-testid="summary-this-week">
            <dt>Cette semaine <span className="admin-stat-muted">({formatDay(data.summary.thisWeek.start)} → {formatDay(data.summary.thisWeek.end)})</span></dt>
            <dd><PeriodValue period={data.summary.thisWeek} /></dd>
          </div>
          <div data-testid="summary-last-week">
            <dt>Semaine dernière <span className="admin-stat-muted">({formatDay(data.summary.lastWeek.start)} → {formatDay(data.summary.lastWeek.end)})</span></dt>
            <dd><PeriodValue period={data.summary.lastWeek} /></dd>
          </div>
          <div data-testid="summary-this-month">
            <dt>{formatMonth(data.summary.thisMonth.month)}</dt>
            <dd><PeriodValue period={data.summary.thisMonth} /></dd>
          </div>
        </dl>
      ) : (
        <p className="admin-stat-muted">Statistiques momentanément inaccessibles.</p>
      )}
      <p className="admin-stat-summary-note">
        Ouvertures anonymes du module DISH (ni clics, ni réservations, ni visiteurs).{' '}
        <Link href={REPORT_HREF}>Voir le détail par jour et par semaine</Link>
      </p>
    </section>
  )
}
