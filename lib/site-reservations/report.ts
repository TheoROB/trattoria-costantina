// Calendar helpers for the admin report. Dates are 'YYYY-MM-DD' and months 'YYYY-MM' strings, in Europe/Paris.
const parisDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })

export const parisDate = (instant: Date) => parisDay.format(instant)

export const monthOf = (date: string) => date.slice(0, 7)

export function addMonths(month: string, months: number) {
  const [year, m] = month.split('-').map(Number)
  const index = year * 12 + (m - 1) + months
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`
}

// A reservation is refused when its meal is further than this from today: the widget never offers such dates.
export const MAX_DAYS_BEFORE = 1
export const MAX_DAYS_AHEAD = 400

export function isPlausibleMealDate(date: string, now: Date) {
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${parisDate(now)}T00:00:00Z`)) / 86_400_000
  return days >= -MAX_DAYS_BEFORE && days <= MAX_DAYS_AHEAD
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

/** Month asked for in the address (?mois=YYYY-MM), clamped to the bounds; anything else gives the current month. */
export function resolveMonth(requested: unknown, current: string, bounds: { earliest: string; latest: string }) {
  if (typeof requested !== 'string' || !MONTH_PATTERN.test(requested)) return current
  if (requested < bounds.earliest) return bounds.earliest
  if (requested > bounds.latest) return bounds.latest
  return requested
}

const dayLabel = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
const monthLabel = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' })
const receivedLabel = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
})

export const formatDay = (date: string) => dayLabel.format(new Date(`${date}T00:00:00Z`))
export const formatMonth = (month: string) => monthLabel.format(new Date(`${month}-01T00:00:00Z`))
export const formatReceived = (instant: Date) => receivedLabel.format(instant)
