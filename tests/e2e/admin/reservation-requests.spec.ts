import fs from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { ADMINS } from './credentials'

const REPORT = '/admin/demandes-de-reservation'
const EVIDENCE = 'docs/reservation-requests-evidence'

async function login(page: Page) {
  await page.goto('/admin/login')
  await page.getByLabel('Email').fill(ADMINS.julien.email)
  await page.getByLabel('Mot de passe').fill(ADMINS.julien.password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/admin$/)
}

// Paris date of now, as the report rows are keyed.
const parisToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
const todayCell = (page: Page) => page.locator(`tr[data-day="${parisToday()}"] td`)
const todayCount = async (page: Page) => Number((await todayCell(page).textContent())!.match(/^\d+/)![0])

test('the report is only for signed-in admins', async ({ page }) => {
  await page.goto(REPORT)
  await expect(page).toHaveURL(/\/admin\/login$/)
  await expect(page.getByRole('heading', { name: 'Demandes de réservation' })).toHaveCount(0)
})

test('an admin sees the openings counted per Paris day and Monday-Sunday week', async ({ page, browser }) => {
  await login(page)
  await page.getByRole('link', { name: 'Demandes de réservation' }).click()
  await expect(page).toHaveURL(REPORT)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Demandes de réservation')
  await expect(page.getByText(/ni un nombre de clics, ni un nombre de réservations/)).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'demandes de réservation' })).toHaveCount(2)
  const before = await todayCount(page)

  // Two openings by a visitor in a separate, anonymous browser.
  const visitor = await browser.newPage()
  await visitor.route('https://reservation.dish.co/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>DISH</title><p>Widget</p>' }),
  )
  await visitor.goto('/carte')
  for (let i = 0; i < 2; i++) {
    const done = visitor.waitForResponse((r) => r.url().endsWith('/api/reservation-requests'))
    await visitor.getByRole('button', { name: 'Réserver une table' }).click()
    expect((await done).status()).toBe(204)
    await visitor.keyboard.press('Escape')
  }
  await visitor.close()

  await page.reload()
  expect(await todayCount(page)).toBe(before + 2)
  // Counting started during this test run: nothing to go back to, nothing invented before.
  await expect(page.getByRole('navigation', { name: 'Mois' }).getByRole('link')).toHaveCount(0)
  const firstOfMonth = `${parisToday().slice(0, 8)}01`
  if (firstOfMonth !== parisToday()) {
    await expect(page.locator(`tr[data-day="${firstOfMonth}"] td`)).toHaveText('indisponible')
  }
  // Out-of-range or malformed months fall back to the current one.
  for (const mois of ['1999-01', '2999-12', 'abc']) {
    await page.goto(`${REPORT}?mois=${mois}`)
    expect(await todayCount(page)).toBe(before + 2)
  }

  fs.mkdirSync(EVIDENCE, { recursive: true })
  await page.goto(REPORT)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: `${EVIDENCE}/admin-desktop.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: `${EVIDENCE}/admin-mobile.png`, fullPage: true })
})
