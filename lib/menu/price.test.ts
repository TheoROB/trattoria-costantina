import { describe, expect, it } from 'vitest'
import { parseEuroPrice } from './price'

describe('parseEuroPrice', () => {
  it.each([
    ['12', 1200],
    ['12,5', 1250],
    ['12,50', 1250],
    ['12.50', 1250],
    ['0,01', 1],
    ['0.5', 50],
    ['1000', 100000],
    ['1000,00', 100000],
    [' 9,90 ', 990],
  ])('accepts %j as %i cents', (input, cents) => {
    expect(parseEuroPrice(input)).toBe(cents)
  })

  it.each(['', ' ', '0', '0,00', '-5', '+5', 'abc', '12€', '1e3', '1E2', '12.345', '12,', ',50', '1 000', '12,5,0',
    '1000,01', '10000', '100000', 'Infinity', 'NaN', '0x10', '١٢'])('rejects %j', (input) => {
    expect(parseEuroPrice(input)).toBeNull()
  })
})
