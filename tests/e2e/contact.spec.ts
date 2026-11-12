import fs from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { startRecaptchaDouble, stubEnterpriseScript } from './recaptcha-double'
import { startResendDouble } from './resend-double'

// The e2e server inherits this process's environment (and .env.local). Three modes:
// - no RESEND_API_KEY: the form must answer "temporarily unavailable";
// - RESEND_BASE_URL=http://127.0.0.1:<port>: a local Resend double receives the mails (success path), e.g.
//   RESEND_BASE_URL=http://127.0.0.1:3790 RESEND_API_KEY=e2e-only-key \
//   CONTACT_FROM='Trattoria Costantina <site@example.test>' CONTACT_TO=restaurant@example.test npx playwright test contact
// - RESEND_API_KEY without RESEND_BASE_URL: real mails could be sent, so the sending tests are skipped.
const apiKey = process.env.RESEND_API_KEY?.trim()
const baseUrl = process.env.RESEND_BASE_URL?.trim()
const doublePort = baseUrl && new URL(baseUrl).hostname === '127.0.0.1' ? Number(new URL(baseUrl).port) : null
const realResend = !!apiKey && doublePort === null

// reCAPTCHA Enterprise, same idea. The site key is embedded by `next build`: build with the same
// NEXT_PUBLIC_RECAPTCHA_SITE_KEY as this run. With RECAPTCHA_API_BASE_URL=http://127.0.0.1:<port>, a local double
// answers the assessments and enterprise.js is stubbed in the page, e.g. (on top of the Resend double):
//   NEXT_PUBLIC_RECAPTCHA_SITE_KEY=e2e-site-key RECAPTCHA_PROJECT_ID=e2e-project RECAPTCHA_API_KEY=e2e-only-key \
//   RECAPTCHA_API_BASE_URL=http://127.0.0.1:3791 (for `npm run build` and `npx playwright test contact`)
const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim()
const recaptchaBase = process.env.RECAPTCHA_API_BASE_URL?.trim()
const recaptchaPort = siteKey && recaptchaBase && new URL(recaptchaBase).hostname === '127.0.0.1' ? Number(new URL(recaptchaBase).port) : null

// One worker for the whole file: the double listens on a fixed port.
test.describe.configure({ mode: 'serial' })

let resend: Awaited<ReturnType<typeof startResendDouble>> | null = null
let recaptcha: Awaited<ReturnType<typeof startRecaptchaDouble>> | null = null
test.beforeAll(async ({ baseURL }) => {
  if (doublePort) resend = await startResendDouble(doublePort)
  if (recaptchaPort) recaptcha = await startRecaptchaDouble(recaptchaPort, new URL(baseURL!).hostname)
})
test.afterAll(async () => {
  await resend?.close()
  await recaptcha?.close()
})
test.beforeEach(async ({ page }) => {
  if (recaptcha) {
    recaptcha.state.score = 0.9
    await stubEnterpriseScript(page)
  }
})

const SENT = 'Merci, votre message a bien été envoyé.'
const TEXT = 'Bonjour, avez-vous une salle pour un repas de 20 personnes ?'

async function openForm(page: Page) {
  await page.goto('/')
  return page.locator('#contact form')
}

async function fillValid(page: Page) {
  await page.getByLabel('Nom').fill('Marie Dupont')
  await page.getByLabel('E-mail').fill('marie@example.test')
  await page.getByLabel(/Téléphone/).fill('06 12 34 56 78')
  await page.getByLabel('Message').fill(TEXT)
}

test('the contact section shows a labelled form, the privacy notice and a hidden spam trap', async ({ page }) => {
  const form = await openForm(page)
  await expect(page.getByRole('heading', { name: 'Nous écrire' })).toBeVisible()
  for (const label of ['Nom', 'E-mail', 'Message']) await expect(form.getByLabel(label)).toBeVisible()
  await expect(form.getByLabel(/Téléphone/)).not.toHaveAttribute('required')
  await expect(form.getByText(/uniquement pour répondre à votre demande/)).toBeVisible()
  await expect(form.getByRole('link', { name: 'données personnelles' })).toHaveAttribute('href', '/mentions-legales#donnees-personnelles')
  await expect(form.getByRole('link', { name: 'trattoria.costantina@gmail.com' })).toHaveAttribute('href', 'mailto:trattoria.costantina@gmail.com')
  await expect(form.getByRole('button', { name: 'Envoyer le message' })).toBeEnabled()

  const trap = form.locator('input[name="website"]')
  await expect(trap).toHaveAttribute('tabindex', '-1')
  await expect(trap).toHaveAttribute('autocomplete', 'off')
  await expect(form.locator('.contact-hp')).toHaveAttribute('aria-hidden', 'true')
  await expect(trap).not.toBeInViewport()
  // Not exposed to assistive technologies.
  await expect(form.getByRole('textbox', { name: /Ne pas remplir/ })).toHaveCount(0)
})

test('the browser blocks an incomplete form before sending', async ({ page }) => {
  const form = await openForm(page)
  let posted = false
  page.on('request', (request) => (posted ||= request.method() === 'POST'))
  await form.getByRole('button', { name: 'Envoyer le message' }).click()
  expect(await form.getByLabel('Nom').evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true)
  await page.getByLabel('E-mail').fill('pas-un-email')
  expect(await form.getByLabel('E-mail').evaluate((el: HTMLInputElement) => el.validity.typeMismatch)).toBe(true)
  expect(posted).toBe(false)
  await expect(form.getByRole('status')).toBeEmpty()
})

test('server-side errors are shown per field, accessibly, and the typed values are kept', async ({ page }) => {
  const form = await openForm(page)
  await form.evaluate((el: HTMLFormElement) => (el.noValidate = true))
  await page.getByLabel('Nom').fill('Marie')
  await page.getByLabel('E-mail').fill('marie@')
  await page.getByLabel('Message').fill('Court')
  await form.getByRole('button', { name: 'Envoyer le message' }).click()

  await expect(form.getByRole('status')).toHaveText('Certains champs sont à corriger.')
  const email = form.getByLabel('E-mail')
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  await expect(email).toHaveAccessibleDescription('Adresse e-mail invalide, par exemple : nom@exemple.fr')
  await expect(form.getByLabel('Message')).toHaveAccessibleDescription('Votre message est trop court (10 caractères minimum).')
  await expect(form.getByLabel('Nom')).not.toHaveAttribute('aria-invalid')
  await expect(form.getByLabel('Nom')).toHaveValue('Marie')
  await expect(email).toHaveValue('marie@')
  await expect(form.getByLabel('Message')).toHaveValue('Court')
})

test('the form also validates on the server without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await openForm(page)
  await page.getByLabel('Nom').fill('Marie')
  await page.getByLabel('E-mail').fill('marie@example.test')
  // Accepted by the browser (no pattern), refused by the server.
  await page.getByLabel(/Téléphone/).fill('appelez-moi')
  await page.getByLabel('Message').fill(TEXT)
  // Implicit submission: html { scroll-behavior: smooth } never lets the button settle for a click without JS.
  await page.getByLabel('E-mail').press('Enter')
  await expect(page.locator('#contact').getByRole('status')).toHaveText('Certains champs sont à corriger.')
  await expect(page.getByLabel(/Téléphone/)).toHaveAccessibleDescription('Numéro de téléphone invalide, par exemple : 06 12 34 56 78')
  await expect(page.getByLabel('E-mail')).toHaveValue('marie@example.test')
  await expect(page.getByLabel('Message')).toHaveValue(TEXT)
  await context.close()
})

test('a filled spam trap gets a fake success and no mail', async ({ page }) => {
  test.skip(realResend, 'RESEND_API_KEY targets the real Resend API')
  const form = await openForm(page)
  await fillValid(page)
  await form.locator('input[name="website"]').evaluate((el: HTMLInputElement) => (el.value = 'https://spam.example'))
  await form.getByRole('button', { name: 'Envoyer le message' }).click()
  await expect(form.getByRole('status')).toContainText(SENT)
  expect(resend?.requests ?? []).toHaveLength(0)
})

test('the button is disabled while sending', async ({ page }) => {
  test.skip(realResend, 'RESEND_API_KEY targets the real Resend API')
  const form = await openForm(page)
  await fillValid(page)
  // Spam trap filled: the server answers without sending anything.
  await form.locator('input[name="website"]').evaluate((el: HTMLInputElement) => (el.value = 'x'))
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/*', async (route) => {
    if (route.request().method() === 'POST') await held
    await route.continue()
  })
  const button = form.getByRole('button', { name: 'Envoyer le message' })
  await button.click()
  await expect(form.getByRole('button', { name: 'Envoi en cours…' })).toBeDisabled()
  release()
  await expect(form.getByRole('status')).toContainText(SENT)
  await expect(button).toBeEnabled()
})

test('without mail configuration the visitor is told to call', async ({ page }) => {
  test.skip(!!apiKey, 'Resend is configured for this run')
  const form = await openForm(page)
  await fillValid(page)
  await form.getByRole('button', { name: 'Envoyer le message' }).click()
  await expect(form.getByRole('status')).toContainText('momentanément indisponible')
  await expect(form.getByRole('status')).toContainText('09 78 81 32 95')
  await expect(form.getByLabel('Message')).toHaveValue(TEXT)
})

test('a valid message is sent once as plain text to the restaurant and the form is cleared', async ({ page }) => {
  test.skip(!resend, 'needs the local Resend double (RESEND_BASE_URL=http://127.0.0.1:<port>)')
  const form = await openForm(page)
  await fillValid(page)
  const button = form.getByRole('button', { name: 'Envoyer le message' })
  // A double click must not send twice: the button is disabled as soon as the first submission starts.
  await button.dblclick()
  await expect(form.getByRole('status')).toContainText(SENT)
  await expect(form.getByLabel('Message')).toHaveValue('')
  await expect(form.getByLabel('Nom')).toHaveValue('')

  expect(resend!.requests).toHaveLength(1)
  const { authorization, userAgent, body } = resend!.requests[0]
  expect(authorization).toBe(`Bearer ${apiKey}`)
  expect(userAgent).toBeTruthy()
  expect(body).toEqual({
    from: process.env.CONTACT_FROM?.trim(),
    to: [process.env.CONTACT_TO?.trim()],
    reply_to: 'marie@example.test',
    subject: 'Message du site : Marie Dupont',
    text: expect.stringContaining(TEXT),
  })
  expect(body.text).toContain('Téléphone : 06 12 34 56 78')
})

test('without reCAPTCHA keys, no Google script nor notice is added', async ({ page }) => {
  test.skip(!!siteKey, 'reCAPTCHA is configured for this build')
  const requested: string[] = []
  page.on('request', (request) => requested.push(request.url()))
  const form = await openForm(page)
  await page.waitForLoadState('load')
  await expect(form.locator('input[name="recaptcha-token"]')).toHaveCount(0)
  await expect(form.getByText(/protégé par reCAPTCHA/)).toHaveCount(0)
  expect(requested.filter((url) => url.includes('recaptcha'))).toEqual([])
})

test('with reCAPTCHA, a token for the "contact" action is checked before the message is sent', async ({ page }) => {
  test.skip(!recaptcha || !resend, 'needs both local doubles (RECAPTCHA_API_BASE_URL and RESEND_BASE_URL)')
  const form = await openForm(page)
  await expect(form.getByText(/Ce site est protégé par reCAPTCHA/)).toBeVisible()
  await expect(form.getByRole('link', { name: 'Règles de confidentialité' })).toHaveAttribute('href', 'https://policies.google.com/privacy')
  await expect(form.getByRole('link', { name: 'Conditions d’utilisation' })).toHaveAttribute('href', 'https://policies.google.com/terms')
  const before = { assessments: recaptcha!.state.requests.length, mails: resend!.requests.length }
  await fillValid(page)
  await form.getByRole('button', { name: 'Envoyer le message' }).click()
  await expect(form.getByRole('status')).toContainText(SENT)
  await expect(form.getByLabel('Message')).toHaveValue('')

  const assessments = recaptcha!.state.requests.slice(before.assessments)
  expect(assessments).toHaveLength(1)
  expect(assessments[0].apiKey).toBe(process.env.RECAPTCHA_API_KEY?.trim())
  expect(assessments[0].url).toBe(`/v1/projects/${process.env.RECAPTCHA_PROJECT_ID?.trim()}/assessments`)
  expect(assessments[0].body.event).toEqual({ token: 'e2e-token-contact', expectedAction: 'contact', siteKey })
  expect(resend!.requests.length - before.mails).toBe(1)
})

test('with reCAPTCHA, a low score is refused without sending and the typed text is kept', async ({ page }) => {
  test.skip(!recaptcha || !resend, 'needs both local doubles (RECAPTCHA_API_BASE_URL and RESEND_BASE_URL)')
  recaptcha!.state.score = 0.1
  const form = await openForm(page)
  const mails = resend!.requests.length
  await fillValid(page)
  await form.getByRole('button', { name: 'Envoyer le message' }).click()
  await expect(form.getByRole('status')).toContainText('protection anti-spam')
  await expect(form.getByRole('status')).toContainText('09 78 81 32 95')
  await expect(form.getByLabel('Message')).toHaveValue(TEXT)
  expect(resend!.requests.length).toBe(mails)
})

test('the server log never shows the API key nor what visitors typed', async () => {
  const log = fs.readFileSync('.e2e-logs/server.log', 'utf8')
  for (const forbidden of [apiKey, process.env.RECAPTCHA_API_KEY?.trim(), 'e2e-token-contact', TEXT, 'marie@example.test', '06 12 34 56 78']) {
    if (forbidden) expect(log).not.toContain(forbidden)
  }
})
