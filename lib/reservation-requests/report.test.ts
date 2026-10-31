import { describe, expect, it } from 'vitest'
import { buildMonthReport, countsByParisDay, MAX_REPORT_MONTHS, monthBounds, monthQueryRange, resolveMonth } from './report'

const at = (iso: string) => new Date(iso)

describe('countsByParisDay', () => {
  it('assigns UTC hours to the Paris day, DST included', () => {
    const counts = countsByParisDay([
      { hour: at('2026-10-24T21:00:00Z'), count: 2 }, // 23:00 CEST on the 24th
      { hour: at('2026-10-24T22:00:00Z'), count: 3 }, // 00:00 CEST on the 25th
      { hour: at('2026-10-25T00:00:00Z'), count: 1 }, // 02:00 CEST (first one)
      { hour: at('2026-10-25T01:00:00Z'), count: 1 }, // 02:00 CET (second one)
      { hour: at('2026-10-25T22:00:00Z'), count: 4 }, // 23:00 CET on the 25th
      { hour: at('2026-10-25T23:00:00Z'), count: 5 }, // 00:00 CET on the 26th
    ])
    expect(Object.fromEntries(counts)).toEqual({ '2026-10-24': 2, '2026-10-25': 9, '2026-10-26': 5 })
  })
})

describe('monthQueryRange', () => {
  it('covers whole Monday-Sunday weeks around the month, in Paris time', () => {
    // October 2026: Thursday 1st to Saturday 31st → Monday 28 Sept to Sunday 1 Nov.
    const { from, to } = monthQueryRange('2026-10')
    expect(from.toISOString()).toBe('2026-09-27T22:00:00.000Z')
    expect(to.toISOString()).toBe('2026-11-01T23:00:00.000Z')
  })

  it('crosses the year', () => {
    const { from, to } = monthQueryRange('2027-01')
    expect(from.toISOString()).toBe('2026-12-27T23:00:00.000Z')
    // Sunday 31 January ends the last week.
    expect(to.toISOString()).toBe('2027-01-31T23:00:00.000Z')
  })
})

describe('monthBounds / resolveMonth', () => {
  const now = at('2026-10-30T10:00:00Z')

  it('goes from the activation month to the current Paris month', () => {
    expect(monthBounds(now, at('2026-08-12T08:00:00Z'))).toEqual({ earliest: '2026-08', latest: '2026-10' })
    // 31 Oct 23:30 UTC is already November in Paris.
    expect(monthBounds(at('2026-10-31T23:30:00Z'), at('2026-08-12T08:00:00Z')).latest).toBe('2026-11')
  })

  it(`never offers more than ${MAX_REPORT_MONTHS} months`, () => {
    expect(monthBounds(now, at('2020-01-01T00:00:00Z'))).toEqual({ earliest: '2024-11', latest: '2026-10' })
  })

  it('only offers the current month before any activation', () => {
    expect(monthBounds(now, null)).toEqual({ earliest: '2026-10', latest: '2026-10' })
  })

  it('accepts only YYYY-MM, clamped to the bounds', () => {
    const bounds = { earliest: '2026-08', latest: '2026-10' }
    expect(resolveMonth('2026-09', bounds)).toBe('2026-09')
    expect(resolveMonth('2026-01', bounds)).toBe('2026-08')
    expect(resolveMonth('2031-01', bounds)).toBe('2026-10')
    for (const bad of [undefined, '', '2026-9', '2026-13', '2026-00', '2026-09-01', '2026-09?x', ['2026-09'], ' 2026-09']) {
      expect(resolveMonth(bad, bounds)).toBe('2026-10')
    }
  })
})

describe('buildMonthReport', () => {
  // Activated on Wednesday 14 Oct 2026 at 15:00 Paris; now is Friday 30 Oct 2026 at 11:00 Paris.
  const activatedAt = at('2026-10-14T13:00:00Z')
  const now = at('2026-10-30T10:00:00Z')
  const counts = new Map([['2026-10-14', 2], ['2026-10-16', 5], ['2026-10-26', 1], ['2026-10-30', 3]])
  const report = buildMonthReport({ month: '2026-10', now, activatedAt, counts })
  const day = (date: string) => report.days.find((d) => d.date === date)!
  const week = (start: string) => report.weeks.find((w) => w.start === start)!

  it('marks days before activation unavailable, never zero', () => {
    expect(day('2026-10-01')).toEqual({ date: '2026-10-01', status: 'unavailable', count: null, partial: false })
    expect(day('2026-10-13').status).toBe('unavailable')
  })

  it('fills observed days without events with zero, flags the activation day and today as partial', () => {
    expect(day('2026-10-14')).toEqual({ date: '2026-10-14', status: 'observed', count: 2, partial: true })
    expect(day('2026-10-15')).toEqual({ date: '2026-10-15', status: 'observed', count: 0, partial: false })
    expect(day('2026-10-16').count).toBe(5)
    expect(day('2026-10-30')).toEqual({ date: '2026-10-30', status: 'observed', count: 3, partial: true })
  })

  it('does not show days to come', () => {
    expect(day('2026-10-31')).toEqual({ date: '2026-10-31', status: 'future', count: null, partial: false })
  })

  it('totals Monday-Sunday weeks, including the days of the neighbouring months', () => {
    expect(report.weeks.map((w) => [w.start, w.end])).toEqual([
      ['2026-09-28', '2026-10-04'],
      ['2026-10-05', '2026-10-11'],
      ['2026-10-12', '2026-10-18'],
      ['2026-10-19', '2026-10-25'],
      ['2026-10-26', '2026-11-01'],
    ])
    expect(week('2026-09-28')).toMatchObject({ status: 'unavailable', count: null })
    expect(week('2026-10-12')).toMatchObject({ status: 'observed', count: 7, partial: true })
    expect(week('2026-10-19')).toMatchObject({ status: 'observed', count: 0, partial: false })
    expect(week('2026-10-26')).toMatchObject({ status: 'observed', count: 4, partial: true })
  })

  it('totals the observed part of the month and offers bounded navigation', () => {
    expect(report).toMatchObject({ status: 'observed', count: 11, partial: true, previous: null, next: null })
  })

  it('reports a fully observed past month without the partial flag', () => {
    const later = buildMonthReport({ month: '2026-11', now: at('2027-01-05T12:00:00Z'), activatedAt, counts: new Map() })
    expect(later).toMatchObject({ status: 'observed', count: 0, partial: false, previous: '2026-10', next: '2026-12' })
    expect(later.days.every((d) => d.status === 'observed' && d.count === 0)).toBe(true)
  })

  it('reports everything unavailable before any activation', () => {
    const empty = buildMonthReport({ month: '2026-10', now, activatedAt: null, counts: new Map() })
    expect(empty).toMatchObject({ status: 'unavailable', count: null, previous: null, next: null })
    expect(empty.days.every((d) => d.status === 'unavailable')).toBe(true)
  })

  it('counts across the year change in Paris time', () => {
    const counts = new Map([['2026-12-31', 1], ['2027-01-01', 2], ['2027-01-03', 4]])
    const january = buildMonthReport({ month: '2027-01', now: at('2027-02-10T12:00:00Z'), activatedAt, counts })
    // Week of Monday 28 Dec to Sunday 3 Jan spans both years.
    expect(january.weeks[0]).toMatchObject({ start: '2026-12-28', end: '2027-01-03', count: 7, partial: false })
    expect(january.count).toBe(6)
  })
})
