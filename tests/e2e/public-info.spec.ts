import { expect, test } from '@playwright/test'

test('the home page shows the opening hours of every day, Sunday closed', async ({ page }) => {
  await page.goto('/')
  const card = page.locator('#trouver .horaires-card')
  await expect(card.getByRole('heading', { name: "Horaires d'ouverture" })).toBeVisible()
  const rows = card.locator('.horaires').first().locator('li')
  await expect(rows).toHaveText([
    'Lundi12h – 13h30',
    'Mardi12h – 13h30',
    'Mercredi12h – 13h30',
    'Jeudi12h – 13h30 / 19h – 21h30',
    'Vendredi12h – 13h30 / 19h – 21h30',
    'Samedi19h – 21h30',
    'DimancheFermé',
  ])
  await expect(card).not.toContainText('Pour connaître nos horaires')
  // The practical info stays in the same card.
  await expect(card.getByRole('heading', { name: 'Infos pratiques' })).toBeVisible()
})

test('the legal notice gives the publisher legal details', async ({ page }) => {
  await page.goto('/mentions-legales')
  const main = page.locator('main')
  for (const text of [
    'Raison sociale : COSTANTINA',
    'Nom commercial : Trattoria Costantina',
    'SARL au capital de 2 000 €',
    'Siège social : 3 rue Denis Papin, 62110 Hénin-Beaumont',
    'RCS : 980 825 020 R.C.S. Arras',
    'SIREN : 980 825 020',
    'SIRET : 980 825 020 00012',
    'TVA intracommunautaire : FR54980825020',
    'Gérant : Julien Panfilo',
    '09 78 81 32 95',
    'trattoria.costantina@gmail.com',
  ]) {
    await expect(main, text).toContainText(text)
  }
  // Not validated yet: never displayed with an invented value.
  await expect(main).not.toContainText('Directeur de la publication')
})

test('the contact section offers the phone only, without e-mail nor form', async ({ page }) => {
  await page.goto('/')
  const contact = page.locator('#contact')
  await expect(contact.getByRole('heading', { level: 2, name: 'Nous contacter' })).toBeVisible()
  await expect(contact).toContainText(
    'Pour toute demande (réservation, question, repas de groupe, privatisation…), contactez-nous directement par téléphone.',
  )
  await expect(contact.getByRole('link', { name: '09 78 81 32 95' })).toHaveAttribute('href', 'tel:+33978813295')
  await expect(contact.locator('a[href^="mailto:"]')).toHaveCount(0)
  await expect(contact.getByRole('link', { name: 'réservation en ligne' })).toHaveAttribute('href', '/#reservation')
  await expect(contact.locator('form, input, textarea, button')).toHaveCount(0)
})

test('the legal notice has an accurate personal data section', async ({ page }) => {
  await page.goto('/mentions-legales#donnees-personnelles')
  const heading = page.locator('#donnees-personnelles')
  await expect(heading).toHaveText('Données personnelles')
  await expect(heading).toBeInViewport()
  const main = page.locator('main')
  await expect(main).toContainText('Le responsable du traitement est la société COSTANTINA')
  await expect(main).toContainText('Le site ne propose pas de formulaire de contact et ne recueille ni vos coordonnées ni vos messages')
  await expect(main).toContainText('sont reçus dans sa boîte Gmail et servent uniquement à vous répondre')
  for (const right of ['accès', 'rectification', 'effacement', 'opposition', 'limitation']) {
    await expect(main, right).toContainText(right)
  }
  await expect(main.getByRole('link', { name: 'www.cnil.fr' })).toHaveAttribute('href', 'https://www.cnil.fr')
  await expect(main.getByRole('heading', { name: 'Cookies' })).toBeVisible()
  await expect(main).toContainText('cookie de session strictement nécessaire')
  // Resend and reCAPTCHA left with the contact form.
  for (const gone of ['Resend', 'reCAPTCHA', '_GRECAPTCHA', 'États-Unis']) await expect(main, gone).not.toContainText(gone)
})
