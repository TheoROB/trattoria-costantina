import { expect, test } from '@playwright/test'
import { execute } from '../../security/helpers/db'
import { ADMINS } from './credentials'

test('the reservation requests page is private', async ({ page }) => {
  await page.goto('/admin/demandes-de-reservation')
  await expect(page).toHaveURL(/\/admin\/login/)
})

test('an admin sees date, time and covers of the month, and moves between months', async ({ page }) => {
  await execute('DELETE FROM site_reservations')
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const iso = (m: number, day: number) => new Date(Date.UTC(year, m, day)).toISOString().slice(0, 10)
  const received = '2026-01-15 11:30:00.000'
  await execute('INSERT INTO site_reservations (received_at, meal_date, meal_time, covers) VALUES (?, ?, ?, ?)', [received, iso(month, 15), '19:45:00', 4])
  await execute('INSERT INTO site_reservations (received_at, meal_date, meal_time, covers) VALUES (?, ?, ?, ?)', [received, iso(month, 15), '12:00:00', 2])
  await execute('INSERT INTO site_reservations (received_at, meal_date, meal_time, covers) VALUES (?, ?, ?, ?)', [received, iso(month + 1, 5), '20:05:00', 6])

  await page.goto('/admin/login')
  await page.getByLabel('Email').fill(ADMINS.theo.email)
  await page.getByLabel('Mot de passe').fill(ADMINS.theo.password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.getByRole('link', { name: 'Demandes de réservation', exact: true }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Demandes de réservation')
  await expect(page.getByTestId('month-total')).toHaveText('2 demandes, 6 couverts')
  const rows = page.locator('tr[data-reservation]')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0).locator('td').nth(1)).toHaveText('12:00')
  await expect(rows.nth(0).locator('td').nth(2)).toHaveText('2')
  await expect(rows.nth(1).locator('td').nth(1)).toHaveText('19:45')
  await expect(rows.nth(1).locator('td').nth(3)).toContainText('15 janv., 12:30')

  await page.getByRole('navigation', { name: 'Mois' }).getByRole('link').last().click()
  await expect(page.getByTestId('month-total')).toHaveText('1 demande, 6 couverts')
  await expect(page.locator('tr[data-reservation] td').nth(1)).toHaveText('20:05')
})
