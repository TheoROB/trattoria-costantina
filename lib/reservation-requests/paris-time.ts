// Calendar helpers for the Europe/Paris reporting day. Plain dates are 'YYYY-MM-DD' strings, months 'YYYY-MM';
// instants are UTC Date objects. DST is handled by Intl (Node ships full ICU), never by a fixed offset.
export const REPORT_TIME_ZONE = 'Europe/Paris'

const zoned = new Intl.DateTimeFormat('en-CA', {
  timeZone: REPORT_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

function zonedParts(instant: Date) {
  const parts = Object.fromEntries(zoned.formatToParts(instant).map((p) => [p.type, p.value]))
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour, minute: +parts.minute, second: +parts.second }
}

const pad = (n: number, size = 2) => String(n).padStart(size, '0')
const toPlain = (utcMs: number) => {
  const d = new Date(utcMs)
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
const plainMs = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Paris calendar date of an instant. */
export function parisDate(instant: Date) {
  const p = zonedParts(instant)
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`
}

// Paris offset from UTC at an instant, in ms (+1 h in winter, +2 h in summer).
function parisOffsetMs(instant: number) {
  const p = zonedParts(new Date(instant))
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000
}

/** UTC instant of 00:00 in Paris on a plain date (midnight always exists: Paris changes time at 02:00/03:00). */
export function parisMidnight(date: string) {
  const wall = plainMs(date)
  const first = wall - parisOffsetMs(wall)
  return new Date(wall - parisOffsetMs(first))
}

export const addDays = (date: string, days: number) => toPlain(plainMs(date) + days * 86_400_000)

/** 1 = Monday … 7 = Sunday. */
export const isoWeekday = (date: string) => new Date(plainMs(date)).getUTCDay() || 7

export const mondayOf = (date: string) => addDays(date, 1 - isoWeekday(date))

export const monthOf = (date: string) => date.slice(0, 7)

export function addMonths(month: string, months: number) {
  const [y, m] = month.split('-').map(Number)
  const index = y * 12 + (m - 1) + months
  return `${pad(Math.floor(index / 12), 4)}-${pad((index % 12) + 1)}`
}

export function daysOfMonth(month: string) {
  const days: string[] = []
  for (let date = `${month}-01`; monthOf(date) === month; date = addDays(date, 1)) days.push(date)
  return days
}

const dayLabel = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
const monthLabel = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' })
const timeLabel = new Intl.DateTimeFormat('fr-FR', {
  timeZone: REPORT_TIME_ZONE, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

export const formatDay = (date: string) => dayLabel.format(new Date(plainMs(date)))
export const formatMonth = (month: string) => monthLabel.format(new Date(plainMs(`${month}-01`)))
export const formatParisTime = (instant: Date) => timeLabel.format(instant)
