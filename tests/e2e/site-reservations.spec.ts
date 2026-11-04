import { expect, test, type Page } from '@playwright/test'
import { query } from '../security/helpers/db'

// Stands in for reservation.dish.co, posting the message the real widget sends once its server accepted a booking.
// A date of its own per test: the database and the server are shared with the other parallel tests.
const dishDate = (daysAhead: number) => {
  const d = new Date(Date.now() + daysAhead * 86_400_000)
  return { iso: d.toISOString().slice(0, 10), dish: `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` }
}
const payload = (date: string, people = '3') =>
  JSON.stringify({ event: 'submit_reservation', params: { people, date, timeslot: '19:45', days: 2, duration: 'not available' } })

// The message leaves on a click in the widget, like a visitor sending the form once the page is ready.
async function stubWidget(page: Page, script: string) {
  await page.route('https://reservation.dish.co/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: `<!doctype html><button onclick="${script.replaceAll('"', '&quot;')}">Envoyer</button>` }))
}
const countFor = async (date: string) =>
  (await query<import('mysql2/promise').RowDataPacket[]>('SELECT covers, TIME_FORMAT(meal_time, \'%H:%i\') AS t FROM site_reservations WHERE meal_date = ?', [date]))
const posted = (page: Page) => page.waitForResponse((r) => r.url().endsWith('/api/site-reservations') && r.request().method() === 'POST')

test('a reservation from the inline widget of the home page is recorded once, with only its date, time and covers', async ({ page }) => {
  const { iso, dish } = dishDate(10)
  const requests: string[] = []
  page.on('request', (r) => { if (r.url().endsWith('/api/site-reservations')) requests.push(r.postData() ?? '') })
  await stubWidget(page, `parent.postMessage({ type: 'iFrameTrackingMessage', payload: ${JSON.stringify(payload(dish))} }, '*')`)
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.locator('.reservation-form-card iframe').scrollIntoViewIfNeeded()
  const response = posted(page)
  await page.frameLocator('.reservation-form-card iframe').getByRole('button', { name: 'Envoyer' }).click()
  expect((await response).status()).toBe(204)
  await expect.poll(() => countFor(iso)).toEqual([{ covers: 3, t: '19:45' }])
  expect(requests).toEqual([JSON.stringify({ date: iso, time: '19:45', covers: 3 })])
})

test('a reservation from the floating button of another page is recorded too', async ({ page }) => {
  const { iso, dish } = dishDate(11)
  await stubWidget(page, `parent.postMessage({ type: 'iFrameTrackingMessage', payload: ${JSON.stringify(payload(dish, '2'))} }, '*')`)
  await page.goto('/carte', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Réserver une table' }).click()
  const response = posted(page)
  await page.frameLocator('#reservation-cta-dialog iframe').getByRole('button', { name: 'Envoyer' }).click()
  expect((await response).status()).toBe(204)
  await expect.poll(() => countFor(iso)).toEqual([{ covers: 2, t: '19:45' }])
})

test('other messages and other senders record nothing', async ({ page }) => {
  const { iso, dish } = dishDate(12)
  let calls = 0
  page.on('request', (r) => { if (r.url().endsWith('/api/site-reservations')) calls++ })
  // Sent by the widget: not a reservation.
  await stubWidget(page, `parent.postMessage({ type: 'iFrameTrackingMessage', payload: '{"event":"other"}' }, '*'); parent.postMessage('hello', '*')`)
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.locator('.reservation-form-card iframe').scrollIntoViewIfNeeded()
  await page.frameLocator('.reservation-form-card iframe').getByRole('button', { name: 'Envoyer' }).click()
  await page.waitForTimeout(500)
  // Right shape, wrong sender: this page itself.
  await page.evaluate((data) => window.postMessage(data, '*'), { type: 'iFrameTrackingMessage', payload: payload(dish) })
  await page.waitForTimeout(500)
  expect(calls).toBe(0)
  expect(await countFor(iso)).toEqual([])
})
