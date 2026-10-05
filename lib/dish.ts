export const DISH_RESERVATION_EID = 'hydra-0ab49cf0-0e40-11f0-b2b0-112fd36a4b37'

const DISH_WIDGET_ORIGIN = 'https://reservation.dish.co'

const widgetParameters = [
  ['eid', DISH_RESERVATION_EID],
  ['tagid', `hors-${DISH_RESERVATION_EID}`],
  ['width', '100%'],
  ['height', ''],
  ['foregroundColor', '#2C1A0E'],
  ['backgroundColor', '#FAF6F0'],
  ['linkColor', '#C47A3A'],
  ['errorColor', ''],
  ['primaryButtonForegroundColor', '#FFFFFF'],
  ['primaryButtonBackgroundColor', '#C47A3A'],
  ['secondaryButtonForegroundColor', '#2C1A0E'],
  ['secondaryButtonBackgroundColor', '#FAF6F0'],
] as const

export function buildDishWidgetUrl() {
  const query = widgetParameters
    .map(([key, value]) => `&${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('')

  return `${DISH_WIDGET_ORIGIN}/widget/${DISH_RESERVATION_EID}?${query}`
}
