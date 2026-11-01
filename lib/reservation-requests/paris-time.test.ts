import { describe, expect, it } from 'vitest'
import { addDays, addMonths, daysOfMonth, formatDay, isoWeekday, mondayOf, parisDate, parisMidnight } from './paris-time'

const utc = (iso: string) => new Date(iso)

describe('parisDate', () => {
  it.each([
    // Winter (UTC+1): 23:00 UTC is already the next day in Paris.
    ['2026-01-14T22:59:59.999Z', '2026-01-14'],
    ['2026-01-14T23:00:00.000Z', '2026-01-15'],
    // Summer (UTC+2): 22:00 UTC is already the next day.
    ['2026-07-14T21:59:59.999Z', '2026-07-14'],
    ['2026-07-14T22:00:00.000Z', '2026-07-15'],
    // New year in Paris before it in UTC.
    ['2026-12-31T23:30:00.000Z', '2027-01-01'],
  ])('%s is %s in Paris', (instant, date) => {
    expect(parisDate(utc(instant))).toBe(date)
  })
})

describe('parisMidnight', () => {
  it.each([
    ['2026-01-15', '2026-01-14T23:00:00.000Z'],
    ['2026-07-15', '2026-07-14T22:00:00.000Z'],
    // Spring forward on 2026-03-29 (02:00 → 03:00): the day starts in winter time and lasts 23 hours.
    ['2026-03-29', '2026-03-28T23:00:00.000Z'],
    ['2026-03-30', '2026-03-29T22:00:00.000Z'],
    // Fall back on 2026-10-25 (03:00 → 02:00): the day starts in summer time and lasts 25 hours.
    ['2026-10-25', '2026-10-24T22:00:00.000Z'],
    ['2026-10-26', '2026-10-25T23:00:00.000Z'],
    ['2027-01-01', '2026-12-31T23:00:00.000Z'],
  ])('%s starts at %s', (date, instant) => {
    expect(parisMidnight(date).toISOString()).toBe(instant)
  })

  it('gives DST days their real length', () => {
    const hours = (date: string) => (parisMidnight(addDays(date, 1)).getTime() - parisMidnight(date).getTime()) / 3_600_000
    expect(hours('2026-03-29')).toBe(23)
    expect(hours('2026-10-25')).toBe(25)
    expect(hours('2026-06-01')).toBe(24)
  })

  it('round-trips with parisDate around the year', () => {
    for (let date = '2026-01-01'; date < '2027-01-02'; date = addDays(date, 1)) {
      expect(parisDate(parisMidnight(date))).toBe(date)
      expect(parisDate(new Date(parisMidnight(date).getTime() - 1))).toBe(addDays(date, -1))
    }
  })
})

describe('calendar arithmetic', () => {
  it('crosses month, year and leap days', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('numbers weekdays from Monday (1) to Sunday (7) and finds the Monday', () => {
    expect(isoWeekday('2026-10-26')).toBe(1)
    expect(isoWeekday('2026-11-01')).toBe(7)
    expect(mondayOf('2026-11-01')).toBe('2026-10-26')
    expect(mondayOf('2026-10-26')).toBe('2026-10-26')
    expect(mondayOf('2027-01-01')).toBe('2026-12-28')
  })

  it('moves by months across years', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-10', -23)).toBe('2024-11')
  })

  it('lists every day of a month', () => {
    expect(daysOfMonth('2028-02')).toHaveLength(29)
    expect(daysOfMonth('2026-02')).toHaveLength(28)
    expect(daysOfMonth('2026-10').at(-1)).toBe('2026-10-31')
  })

  it('formats days in French', () => {
    expect(formatDay('2026-10-26')).toBe('lun. 26 oct.')
  })
})
