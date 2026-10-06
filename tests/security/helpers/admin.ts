import { expect, type BrowserContext, type Page } from '@playwright/test'
import { ADMIN_USERS, GENERIC_LOGIN_ERROR, SESSION_COOKIE } from './credentials'

type Credentials = { email: string; password: string }

export async function login(page: Page, credentials: Credentials = ADMIN_USERS.julien) {
  await page.goto('/admin/login')
  await page.getByLabel('Email').fill(credentials.email)
  await page.getByLabel('Mot de passe').fill(credentials.password)
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/admin'),
    page.getByRole('button', { name: 'Se connecter' }).click(),
  ])
  await expect(page).toHaveURL(/\/admin$/)
}

export async function expectLoginFailure(page: Page, email: string, password: string) {
  await page.goto('/admin/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mot de passe').fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('alert')).toHaveText(GENERIC_LOGIN_ERROR)
  await expect(page).toHaveURL(/\/admin\/login$/)
}

export async function sessionToken(context: BrowserContext) {
  const cookie = (await context.cookies()).find(({ name }) => name === SESSION_COOKIE)
  if (!cookie) throw new Error(`Missing ${SESSION_COOKIE} cookie after login`)
  return cookie.value
}

export async function logout(page: Page) {
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/admin/login'),
    page.getByRole('button', { name: 'Se déconnecter' }).click(),
  ])
}

export async function fillItemForm(
  page: Page,
  values: {
    category?: string
    name: string
    description?: string
    price?: string
    available?: boolean
    visible?: boolean
  },
) {
  await page.getByLabel('Catégorie').selectOption(values.category ?? 'pizzas')
  await page.getByLabel('Nom').fill(values.name)
  await page.getByLabel('Description').fill(values.description ?? 'Description for a security test item')
  await page.getByLabel('Prix (€)').fill(values.price ?? '12,50')
  await page.getByLabel('Disponible').setChecked(values.available ?? true)
  await page.getByLabel('Visible sur le site').setChecked(values.visible ?? true)
}

export async function createItemThroughUi(page: Page, name: string) {
  await page.goto('/admin/menu/new')
  await fillItemForm(page, { name })
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/admin'),
    page.getByRole('button', { name: 'Enregistrer' }).click(),
  ])
}
