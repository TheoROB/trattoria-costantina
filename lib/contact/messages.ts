import { site } from '@/lib/site'

const fallback = `appelez-nous au ${site.phone.display} ou écrivez-nous à ${site.email.display}`

export const CONTACT_MESSAGES = {
  sent: 'Merci, votre message a bien été envoyé. Nous vous répondrons dès que possible.',
  invalid: 'Certains champs sont à corriger.',
  unavailable: `Le formulaire est momentanément indisponible : ${fallback}.`,
  rateLimited: `Trop de messages ont été envoyés récemment. Réessayez plus tard ou ${fallback}.`,
  spamCheckFailed: `Votre message n’a pas pu être vérifié par notre protection anti-spam. Réessayez ou ${fallback}.`,
  spamCheckUnavailable: `La vérification anti-spam est momentanément indisponible. Réessayez dans quelques minutes ou ${fallback}.`,
  sendFailed: `Votre message n’a pas pu être envoyé. Réessayez dans quelques minutes ou ${fallback}.`,
  // Field errors (lib/contact/schema.ts, lib/contact/links.ts).
  linkInName: 'Pour des raisons de sécurité, les liens ne sont pas acceptés dans le nom. Merci de le retirer.',
  linkInMessage: 'Pour des raisons de sécurité, les liens ne sont pas acceptés dans le message. Merci de le retirer.',
} as const
