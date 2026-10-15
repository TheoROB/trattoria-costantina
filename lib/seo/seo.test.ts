import { describe, expect, it } from 'vitest'
import { buildRestaurantJsonLd, serializeJsonLd } from './jsonld'
import { DEFAULT_SITE_ORIGIN, getSiteOrigin } from './origin'
import { buildRobots, buildSitemap } from './routes'

const origin = 'https://example.test'

describe('getSiteOrigin', () => {
  it('uses APP_ORIGIN when it is a bare origin', () => {
    expect(getSiteOrigin('http://localhost:3400')).toBe('http://localhost:3400')
    expect(getSiteOrigin('https://example.test/')).toBe('https://example.test')
  })

  it('falls back to the announced domain when APP_ORIGIN is missing or invalid', () => {
    expect(getSiteOrigin(undefined)).toBe(DEFAULT_SITE_ORIGIN)
    expect(getSiteOrigin('https://example.test/path')).toBe(DEFAULT_SITE_ORIGIN)
    expect(DEFAULT_SITE_ORIGIN).toBe('https://trattoriacostantina.fr')
  })
})

describe('buildSitemap', () => {
  it('lists only the indexable public pages', () => {
    expect(buildSitemap(origin).map((e) => e.url)).toEqual([`${origin}/`, `${origin}/carte`])
  })
})

describe('buildRobots', () => {
  it('keeps crawlers out of the admin and the API and points to the sitemap', () => {
    expect(buildRobots(origin)).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api'] },
      sitemap: `${origin}/sitemap.xml`,
    })
  })
})

describe('buildRestaurantJsonLd', () => {
  const data = buildRestaurantJsonLd(origin)

  it('describes the restaurant with sourced facts only', () => {
    expect(data).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      name: 'Trattoria Costantina',
      url: `${origin}/`,
      image: `${origin}/images/og/1280.jpg`,
      logo: `${origin}/images/logo/480.png`,
      telephone: '+33978813295',
      email: 'trattoria.costantina@gmail.com',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '3 rue Denis Papin',
        postalCode: '62110',
        addressLocality: 'Hénin-Beaumont',
        addressCountry: 'FR',
      },
      servesCuisine: 'Italian',
      openingHoursSpecification: [
        {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          opens: '12:00',
          closes: '13:30',
        },
        {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Thursday', 'Friday', 'Saturday'],
          opens: '19:00',
          closes: '21:30',
        },
      ],
      acceptsReservations: true,
      hasMenu: `${origin}/carte`,
      foundingDate: '2024-02-05',
    })
  })

  it('never mentions Sunday, when the restaurant is closed', () => {
    expect(JSON.stringify(data.openingHoursSpecification)).not.toContain('Sunday')
  })

  it('never states unconfirmed data (prices, social networks, ratings)', () => {
    for (const key of ['openingHours', 'priceRange', 'sameAs', 'aggregateRating']) {
      expect(data).not.toHaveProperty(key)
    }
  })
})

describe('serializeJsonLd', () => {
  it('escapes "<" so the payload cannot close the script element', () => {
    const json = serializeJsonLd({ name: '</script><script>alert(1)</script>' })
    expect(json).not.toContain('<')
    expect(JSON.parse(json)).toEqual({ name: '</script><script>alert(1)</script>' })
  })
})
