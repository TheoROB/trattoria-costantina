import { z } from 'zod'
import { formDataToObject } from '@/lib/menu/admin-input'
import { CONTACT_LIMITS, EMPTY_CONTACT_VALUES, HONEYPOT_FIELD, type ContactField, type ContactValues } from './fields'

export type ContactMessage = { name: string; email: string; phone: string | null; message: string }

export type ContactParseResult =
  | { kind: 'valid'; data: ContactMessage }
  | { kind: 'spam' }
  | { kind: 'invalid'; fieldErrors: Partial<Record<ContactField, string>>; values: ContactValues }

// Single-line fields end up in mail headers (Subject, Reply-To): no control character at all, nor the
// Unicode line and paragraph separators, so no header can be injected.
const SINGLE_LINE_FORBIDDEN = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/
const MULTI_LINE_FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/

const schema = z.strictObject({
  name: z
    .string({ error: 'Indiquez votre nom.' })
    .trim()
    .min(1, 'Indiquez votre nom.')
    .max(CONTACT_LIMITS.name, `Le nom ne doit pas dépasser ${CONTACT_LIMITS.name} caractères.`)
    .refine((v) => !SINGLE_LINE_FORBIDDEN.test(v), 'Le nom contient des caractères non autorisés.'),
  email: z
    .string({ error: 'Indiquez votre adresse e-mail.' })
    .trim()
    .min(1, 'Indiquez votre adresse e-mail.')
    .max(CONTACT_LIMITS.email, 'Adresse e-mail trop longue.')
    .refine((v) => !SINGLE_LINE_FORBIDDEN.test(v), 'Adresse e-mail invalide, par exemple : nom@exemple.fr')
    .pipe(z.email('Adresse e-mail invalide, par exemple : nom@exemple.fr')),
  phone: z
    .string()
    .trim()
    .max(CONTACT_LIMITS.phone, 'Numéro de téléphone invalide.')
    .refine((v) => v === '' || /^\+?[0-9][0-9 .()-]{5,}$/.test(v), 'Numéro de téléphone invalide, par exemple : 06 12 34 56 78')
    .transform((v) => v || null)
    .prefault(''),
  message: z
    .string({ error: 'Écrivez votre message.' })
    .transform((v) => v.replace(/\r\n?/g, '\n').trim())
    .pipe(
      z
        .string()
        .min(1, 'Écrivez votre message.')
        .min(CONTACT_LIMITS.messageMin, `Votre message est trop court (${CONTACT_LIMITS.messageMin} caractères minimum).`)
        .max(CONTACT_LIMITS.message, `Votre message ne doit pas dépasser ${CONTACT_LIMITS.message} caractères.`)
        .refine((v) => !MULTI_LINE_FORBIDDEN.test(v), 'Le message contient des caractères non autorisés.'),
    ),
})

const FIELDS: ContactField[] = ['name', 'email', 'phone', 'message']

// What the form shows again after an error: only the known fields, cut to their limit.
function echoValues(object: Record<string, string>): ContactValues {
  const values = { ...EMPTY_CONTACT_VALUES }
  for (const field of FIELDS) values[field] = (object[field] ?? '').slice(0, CONTACT_LIMITS[field])
  return values
}

export function parseContactForm(formData: FormData): ContactParseResult {
  const object = formDataToObject(formData)
  if (!object) return { kind: 'invalid', fieldErrors: {}, values: EMPTY_CONTACT_VALUES }
  const { [HONEYPOT_FIELD]: honeypot, ...fields } = object
  if (honeypot) return { kind: 'spam' }
  const result = schema.safeParse(fields)
  if (!result.success) {
    const fieldErrors: Partial<Record<ContactField, string>> = {}
    for (const issue of result.error.issues) {
      const field = issue.path[0] as ContactField
      if (FIELDS.includes(field)) fieldErrors[field] ??= issue.message
    }
    return { kind: 'invalid', fieldErrors, values: echoValues(fields) }
  }
  return { kind: 'valid', data: result.data }
}
