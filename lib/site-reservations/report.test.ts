import { describe, expect, it } from 'vitest'
import { addMonths, formatDay, formatMonth, formatReceived, isPlausibleMealDate, parisDate, resolveMonth } from './report'

describe('parisDate', () => {
  it('uses the Paris calendar day, summer and winter', () => {
    expect(parisDate(new Date('2026-07-14T22:30:00Z'))).toBe('2026-07-15')
    expect(parisDate(new Date('2026-12-31T22:59:00Z'))).toBe('2026-12-31')
    expect(parisDate(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01-01')
  })
})

describe('addMonths', () => {
  it('crosses years in both directions', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })
})

describe('isPlausibleMealDate', () => {
  const now = new Date('2026-11-04T12:00:00Z')

  it('accepts yesterday (a booking around midnight) up to 400 days ahead', () => {
    expect(isPlausibleMealDate('2026-11-03', now)).toBe(true)
    expect(isPlausibleMealDate('2027-12-09', now)).toBe(true)
  })

  it('refuses anything further', () => {
    expect(isPlausibleMealDate('2026-11-02', now)).toBe(false)
    expect(isPlausibleMealDate('2027-12-10', now)).toBe(false)
  })
})

describe('resolveMonth', () => {
  const bounds = { earliest: '2026-05', latest: '2026-12' }

  it('falls back to the current month on anything invalid', () => {
    for (const value of [undefined, ['2026-07'], '2026-13', 'juillet', "2026-07' OR 1=1"]) {
      expect(resolveMonth(value, '2026-11', bounds)).toBe('2026-11')
    }
  })

  it('clamps to the months that have data', () => {
    expect(resolveMonth('2020-01', '2026-11', bounds)).toBe('2026-05')
    expect(resolveMonth('2030-01', '2026-11', bounds)).toBe('2026-12')
    expect(resolveMonth('2026-07', '2026-11', bounds)).toBe('2026-07')
  })
})

describe('labels', () => {
  it('reads in French, received times in Paris', () => {
    expect(formatDay('2026-11-06')).toBe('ven. 6 nov.')
    expect(formatMonth('2026-11')).toBe('novembre 2026')
    expect(formatReceived(new Date('2026-07-14T22:30:00Z'))).toBe('15 juil., 00:30')
  })
})
