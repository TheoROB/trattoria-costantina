import { site } from '@/lib/site'

const fallback = `appelez-nous au ${site.phone.display} ou écrivez-nous à ${site.email.display}`

export const CONTACT_MESSAGES = {
  sent: 'Merci, votre message a bien été envoyé. Nous vous répondrons dès que possible.',
  invalid: 'Certains champs sont à corriger.',
  unavailable: `Le formulaire est momentanément indisponible : ${fallback}.`,
  rateLimited: `Trop de messages ont été envoyés récemment. Réessayez plus tard ou ${fallback}.`,
  sendFailed: `Votre message n’a pas pu être envoyé. Réessayez dans quelques minutes ou ${fallback}.`,
} as const
