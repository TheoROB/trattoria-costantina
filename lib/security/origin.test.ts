import { describe, expect, it } from 'vitest'
import { isAllowedOrigin, resolveAppOrigin } from './origin'

describe('resolveAppOrigin', () => {
  it('normalises a configured origin', () => {
    expect(resolveAppOrigin('https://trattoriacostantina.fr/')).toBe('https://trattoriacostantina.fr')
    expect(resolveAppOrigin('http://localhost:3100')).toBe('http://localhost:3100')
  })

  it.each([undefined, '', 'trattoriacostantina.fr', 'https://trattoriacostantina.fr/admin', 'ftp://example.fr', 'https://user:pw@example.fr'])(
    'is null (callers then refuse) for %s',
    (value) => {
      expect(resolveAppOrigin(value)).toBeNull()
    },
  )
})

describe('isAllowedOrigin', () => {
  const app = 'https://trattoriacostantina.fr'

  it('accepts only the exact configured origin', () => {
    expect(isAllowedOrigin('https://trattoriacostantina.fr', app)).toBe(true)
  })

  it.each([
    null,
    '',
    'null',
    'http://trattoriacostantina.fr',
    'https://trattoriacostantina.fr:8443',
    'https://www.trattoriacostantina.fr',
    'https://trattoriacostantina.fr.evil.example',
    'https://evil.example',
  ])('refuses %s', (origin) => {
    expect(isAllowedOrigin(origin, app)).toBe(false)
  })

  it('refuses everything when no origin is configured', () => {
    expect(isAllowedOrigin('https://trattoriacostantina.fr', null)).toBe(false)
  })
})
