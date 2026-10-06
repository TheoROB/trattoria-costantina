import { z } from 'zod'
import { MENU_CATEGORIES, type MenuCategoryKey } from './categories'
import { parseEuroPrice } from './price'

export type MenuItemInput = {
  categoryKey: MenuCategoryKey
  name: string
  description: string | null
  priceCents: number
  isAvailable: boolean
  isVisible: boolean
}

export type FieldName = 'category' | 'name' | 'description' | 'price'
export type ParseResult = { ok: true; data: MenuItemInput } | { ok: false; fieldErrors: Partial<Record<FieldName, string>> }

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/
const CONTROL_CHARS_EXCEPT_NEWLINES = /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/
const categoryKeys = MENU_CATEGORIES.map((c) => c.key) as [MenuCategoryKey, ...MenuCategoryKey[]]
// An HTML checkbox is either absent or sent with its default value "on".
const checkbox = z.literal('on').optional().transform((value) => value === 'on')

const schema = z.strictObject({
  category: z.enum(categoryKeys, { error: 'Choisissez une catégorie.' }),
  name: z
    .string()
    .trim()
    .min(1, 'Le nom est obligatoire.')
    .max(80, 'Le nom ne doit pas dépasser 80 caractères.')
    .refine((v) => !CONTROL_CHARS.test(v), 'Le nom contient des caractères non autorisés.'),
  description: z
    .string()
    .trim()
    .max(400, 'La description ne doit pas dépasser 400 caractères.')
    .refine((v) => !CONTROL_CHARS_EXCEPT_NEWLINES.test(v), 'La description contient des caractères non autorisés.')
    .transform((v) => v || null)
    .default(''),
  price: z
    .string({ error: 'Le prix est obligatoire.' })
    .max(16, 'Prix invalide.')
    .transform((v, ctx) => {
      const cents = parseEuroPrice(v)
      if (cents === null) {
        ctx.addIssue({ code: 'custom', message: 'Prix invalide : indiquez un montant entre 0,01 et 1000 €, par exemple 12,50.' })
        return z.NEVER
      }
      return cents
    }),
  isAvailable: checkbox,
  isVisible: checkbox,
})

// Next.js adds these fields for progressive enhancement of <form action={serverAction}>.
const isFrameworkField = (key: string) => key.startsWith('$ACTION')

// Strict FormData decoding: text values only, no duplicates, no unknown field (zod strictObject).
export function formDataToObject(formData: FormData): Record<string, string> | null {
  const object: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (isFrameworkField(key)) continue
    if (typeof value !== 'string' || Object.hasOwn(object, key)) return null
    object[key] = value
  }
  return object
}

export function parseMenuItemForm(formData: FormData): ParseResult {
  const object = formDataToObject(formData)
  if (!object) return { ok: false, fieldErrors: {} }
  const result = schema.safeParse(object)
  if (!result.success) {
    const fieldErrors: Partial<Record<FieldName, string>> = {}
    for (const issue of result.error.issues) {
      const field = issue.path[0] as FieldName
      if (['category', 'name', 'description', 'price'].includes(field)) fieldErrors[field] ??= issue.message
    }
    return { ok: false, fieldErrors }
  }
  const { category, price, ...rest } = result.data
  return { ok: true, data: { categoryKey: category, priceCents: price, ...rest } }
}

// menu_items.id is INT UNSIGNED.
export function parseItemId(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) return null
  const id = Number(value)
  return id <= 4294967295 ? id : null
}
