import { describe, expect, it } from 'vitest'
import { DISH_RESERVATION_EID, buildDishWidgetUrl } from './dish'

describe('buildDishWidgetUrl', () => {
  it('targets the restaurant DISH widget', () => {
    const url = new URL(buildDishWidgetUrl())

    expect(DISH_RESERVATION_EID).toBe('hydra-0ab49cf0-0e40-11f0-b2b0-112fd36a4b37')
    expect(url.origin).toBe('https://reservation.dish.co')
    expect(url.pathname).toBe('/widget/hydra-0ab49cf0-0e40-11f0-b2b0-112fd36a4b37')
    expect(url.searchParams.get('eid')).toBe(DISH_RESERVATION_EID)
    expect(url.searchParams.get('tagid')).toBe(`hors-${DISH_RESERVATION_EID}`)
    expect(url.searchParams.get('width')).toBe('100%')
    expect(url.searchParams.get('height')).toBe('')
  })

  it('encodes the site colours in the format accepted by DISH', () => {
    const widgetUrl = buildDishWidgetUrl()
    const url = new URL(widgetUrl)

    expect(widgetUrl).toContain('foregroundColor=%232C1A0E')
    expect(widgetUrl).toContain('width=100%25')
    expect(widgetUrl).not.toContain('#')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      foregroundColor: '#2C1A0E',
      backgroundColor: '#FAF6F0',
      linkColor: '#C47A3A',
      errorColor: '',
      primaryButtonForegroundColor: '#FFFFFF',
      primaryButtonBackgroundColor: '#C47A3A',
      secondaryButtonForegroundColor: '#2C1A0E',
      secondaryButtonBackgroundColor: '#FAF6F0',
    })
  })
})
