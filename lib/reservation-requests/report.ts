import { addDays, addMonths, daysOfMonth, mondayOf, monthOf, parisDate, parisMidnight } from './paris-time'

// Navigation goes back at most this many months (current one included), never before the activation month.
export const MAX_REPORT_MONTHS = 24

// unavailable: before counting started (no data, not zero). future: not started yet. observed: counted, zero included.
export type PeriodStatus = 'unavailable' | 'observed' | 'future'
export type Period = {
  status: PeriodStatus
  /** null unless observed. */
  count: number | null
  /** Observed but only in part (activation day, current day, or a week/month mixing observed and other days). */
  partial: boolean
}
export type DayReport = Period & { date: string }
export type WeekReport = Period & { start: string; end: string }
export type MonthReport = Period & {
  month: string
  days: DayReport[]
  /** Monday-Sunday weeks touching the month, each with its full total (days of the neighbouring months included). */
  weeks: WeekReport[]
  previous: string | null
  next: string | null
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export function monthBounds(now: Date, activatedAt: Date | null) {
  const latest = monthOf(parisDate(now))
  const oldestAllowed = addMonths(latest, -(MAX_REPORT_MONTHS - 1))
  const activation = activatedAt ? monthOf(parisDate(activatedAt)) : latest
  const earliest = activation > oldestAllowed ? (activation < latest ? activation : latest) : oldestAllowed
  return { earliest, latest }
}

/** Month asked for in the address (?mois=YYYY-MM), clamped to the bounds; anything else gives the current month. */
export function resolveMonth(requested: unknown, bounds: { earliest: string; latest: string }) {
  if (typeof requested !== 'string' || !MONTH_PATTERN.test(requested)) return bounds.latest
  if (requested < bounds.earliest) return bounds.earliest
  if (requested > bounds.latest) return bounds.latest
  return requested
}

/** UTC range [from, to) covering every Monday-Sunday week that touches the month. */
export function monthQueryRange(month: string) {
  const days = daysOfMonth(month)
  const firstMonday = mondayOf(days[0])
  const afterLastSunday = addDays(mondayOf(days.at(-1)!), 7)
  return { from: parisMidnight(firstMonday), to: parisMidnight(afterLastSunday) }
}

/** Sums hourly UTC buckets per Paris day. Paris offsets are whole hours, so an hour never straddles two days. */
export function countsByParisDay(hours: { hour: Date; count: number }[]) {
  const counts = new Map<string, number>()
  for (const { hour, count } of hours) {
    const date = parisDate(hour)
    counts.set(date, (counts.get(date) ?? 0) + count)
  }
  return counts
}

function dayReport(date: string, now: Date, activatedAt: Date | null, counts: Map<string, number>): DayReport {
  const start = parisMidnight(date)
  const end = parisMidnight(addDays(date, 1))
  if (!activatedAt || end <= activatedAt) return { date, status: 'unavailable', count: null, partial: false }
  if (start > now) return { date, status: 'future', count: null, partial: false }
  return { date, status: 'observed', count: counts.get(date) ?? 0, partial: activatedAt > start || now < end }
}

function combine(days: DayReport[]): Period {
  const observed = days.filter((d) => d.status === 'observed')
  if (!observed.length) {
    return { status: days.every((d) => d.status === 'future') ? 'future' : 'unavailable', count: null, partial: false }
  }
  return {
    status: 'observed',
    count: observed.reduce((sum, d) => sum + d.count!, 0),
    partial: observed.length < days.length || observed.some((d) => d.partial),
  }
}

export function buildMonthReport({
  month, now, activatedAt, counts,
}: { month: string; now: Date; activatedAt: Date | null; counts: Map<string, number> }): MonthReport {
  const day = (date: string) => dayReport(date, now, activatedAt, counts)
  const days = daysOfMonth(month).map(day)
  const weeks: WeekReport[] = []
  for (let start = mondayOf(days[0].date); monthOf(start) <= month; start = addDays(start, 7)) {
    const weekDays = Array.from({ length: 7 }, (_, i) => day(addDays(start, i)))
    weeks.push({ start, end: weekDays[6].date, ...combine(weekDays) })
  }
  const bounds = monthBounds(now, activatedAt)
  return {
    month,
    days,
    weeks,
    ...combine(days),
    previous: month > bounds.earliest ? addMonths(month, -1) : null,
    next: month < bounds.latest ? addMonths(month, 1) : null,
  }
}
