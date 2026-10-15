import { expect, test, type Page } from '@playwright/test'
import { startSmtpSink } from './smtp-sink'

// The e2e server inherits this process's environment (and .env.local). Three modes:
// - no SMTP_HOST: the form must answer "temporarily unavailable";
// - SMTP_HOST=127.0.0.1 + SMTP_PORT: a local sink receives the mails (success path), e.g.
//   SMTP_HOST=127.0.0.1 SMTP_PORT=2526 SMTP_SECURE=false SMTP_USER=e2e SMTP_PASSWORD=e2e \
//   CONTACT_FROM=site@example.test CONTACT_TO=restaurant@example.test npx playwright test contact
// - any other SMTP_HOST: real mails could be sent, so the sending tests are skipped.
const smtpHost = process.env.SMTP_HOST?.trim()
const sinkPort = smtpHost === '127.0.0.1' ? Number(process.env.SMTP_PORT) : null
const realSmtp = !!smtpHost && sinkPort === null

// One worker for the whole file: the sink listens on a fixed port.
test.describe.configure({ mode: 'serial' })

let sink: Awaited<ReturnType<typeof startSmtpSink>> | null = null
test.beforeAll(async () => {
  if (sinkPort) sink = await startSmtpSink(sinkPort)
})
test.afterAll(async () => {
  await sink?.close()
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
  test.skip(realSmtp, 'SMTP_HOST points to a real server')
  const form = await openForm(page)
  await fillValid(page)
  await form.locator('input[name="website"]').evaluate((el: HTMLInputElement) => (el.value = 'https://spam.example'))
  await form.getByRole('button', { name: 'Envoyer le message' }).click()
  await expect(form.getByRole('status')).toContainText(SENT)
  expect(sink?.messages ?? []).toHaveLength(0)
})

test('the button is disabled while sending', async ({ page }) => {
  test.skip(realSmtp, 'SMTP_HOST points to a real server')
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
  test.skip(!!smtpHost, 'SMTP is configured for this run')
  const form = await openForm(page)
  await fillValid(page)
  await form.getByRole('button', { name: 'Envoyer le message' }).click()
  await expect(form.getByRole('status')).toContainText('momentanément indisponible')
  await expect(form.getByRole('status')).toContainText('09 78 81 32 95')
  await expect(form.getByLabel('Message')).toHaveValue(TEXT)
})

test('a valid message is sent as plain text to the restaurant and the form is cleared', async ({ page }) => {
  test.skip(!sink, 'needs the local SMTP sink (SMTP_HOST=127.0.0.1)')
  const form = await openForm(page)
  await fillValid(page)
  await form.getByRole('button', { name: 'Envoyer le message' }).click()
  await expect(form.getByRole('status')).toContainText(SENT)
  await expect(form.getByLabel('Message')).toHaveValue('')
  await expect(form.getByLabel('Nom')).toHaveValue('')

  expect(sink!.messages).toHaveLength(1)
  const raw = sink!.messages[0]
  const headers = raw.split('\n\n')[0]
  expect(headers).toMatch(/^From: .*<site@example\.test>$/m)
  expect(headers).toMatch(/^To: restaurant@example\.test$/m)
  expect(headers).toMatch(/^Reply-To: .*marie@example\.test/m)
  expect(headers).toMatch(/^Content-Type: text\/plain/m)
  expect(raw).not.toMatch(/text\/html/i)
})
