'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getPool } from '@/lib/db'
import { dbErrorCode, requireAdmin } from '@/lib/auth/dal'
import {
  createMenuItem,
  deleteMenuItem,
  moveMenuItem,
  moveMenuItemTo,
  removeMenuItemPhoto,
  setMenuItemFlag,
  updateMenuItem,
  type MutationResult,
} from '@/lib/menu/admin'
import { formDataToObject, parseItemId, parseMenuItemForm, type FieldName } from '@/lib/menu/admin-input'
import type { StoredCategoryKey } from '@/lib/menu/categories'
import { discardMenuPhoto } from '@/lib/media/menu-photos'

export type ItemFormState = {
  error: string | null
  fieldErrors?: Partial<Record<FieldName, string>>
  // Submitted text, echoed back so the form keeps what was typed after a validation error.
  values?: Record<string, string>
  // Set instead of redirecting when the form still has a photo to send (POST /api/admin/menu/<id>/photo).
  savedId?: number
}

// Quick actions of the list (availability, visibility, order): the list updates at once and rolls back
// when the result is not 'ok'.
export type ListActionResult = 'ok' | 'not_found' | 'failed' | 'invalid'

const MESSAGES = {
  invalid: 'Certains champs sont invalides : corrigez-les puis enregistrez.',
  notFound: 'Cet élément n’existe plus : il a peut-être été supprimé entre-temps.',
  failed: 'L’enregistrement a échoué. Réessayez dans un instant.',
  confirm: 'Cochez la case de confirmation pour supprimer cet élément.',
}

const ECHOED_FIELDS = ['category', 'name', 'description', 'price', 'isAvailable', 'isVisible']
const echo = (formData: FormData) =>
  Object.fromEntries(ECHOED_FIELDS.map((k) => [k, String(formData.get(k) ?? '').slice(0, 500)]))

async function mutate(operation: string, work: () => Promise<MutationResult | unknown>) {
  try {
    return (await work()) === 'not_found' ? 'not_found' : 'ok'
  } catch (error) {
    console.error(`[admin] ${operation} failed: ${dbErrorCode(error)}`)
    return 'failed'
  }
}

async function attempt<T>(operation: string, work: () => Promise<T>): Promise<T | 'failed'> {
  try {
    return await work()
  } catch (error) {
    console.error(`[admin] ${operation} failed: ${dbErrorCode(error)}`)
    return 'failed'
  }
}

// Added by ItemForm when a photo is selected: the action then returns the saved id so the form can
// upload the photo, instead of redirecting.
function takePhotoPending(formData: FormData) {
  const pending = formData.getAll('photoPending')
  formData.delete('photoPending')
  return pending.length === 1 && pending[0] === '1'
}

// Back to the list, on the category of the item.
function done(categoryKey: StoredCategoryKey) {
  revalidatePath('/admin')
  redirect(`/admin?categorie=${categoryKey}`)
}

function saved(id: number, categoryKey: StoredCategoryKey, photoPending: boolean): ItemFormState {
  if (!photoPending) done(categoryKey)
  revalidatePath('/admin')
  return { error: null, savedId: id }
}

// List page actions report errors through a closed set of query values.
const fail = (code: 'introuvable' | 'echec' | 'invalide') => redirect(`/admin?erreur=${code}`)

export async function createItem(_previous: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const admin = await requireAdmin()
  const photoPending = takePhotoPending(formData)
  const parsed = parseMenuItemForm(formData)
  if (!parsed.ok) return { error: MESSAGES.invalid, fieldErrors: parsed.fieldErrors, values: echo(formData) }
  const result = await attempt('create', () => createMenuItem(getPool(), admin.adminUserId, parsed.data))
  if (result === 'failed') return { error: MESSAGES.failed, values: echo(formData) }
  return saved(result.id, parsed.data.categoryKey, photoPending)
}

export async function updateItem(_previous: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const admin = await requireAdmin()
  const id = parseItemId(formData.get('id'))
  formData.delete('id')
  const photoPending = takePhotoPending(formData)
  const parsed = parseMenuItemForm(formData)
  if (!id || !parsed.ok) {
    return { error: MESSAGES.invalid, fieldErrors: parsed.ok ? {} : parsed.fieldErrors, values: echo(formData) }
  }
  const result = await mutate('update', () => updateMenuItem(getPool(), admin.adminUserId, id, parsed.data))
  if (result === 'not_found') return { error: MESSAGES.notFound, values: echo(formData) }
  if (result === 'failed') return { error: MESSAGES.failed, values: echo(formData) }
  return saved(id, parsed.data.categoryKey, photoPending)
}

const deleteSchema = z.strictObject({ id: z.string(), confirm: z.literal('on') })

export async function deleteItem(_previous: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const admin = await requireAdmin()
  const object = formDataToObject(formData)
  const parsed = object ? deleteSchema.safeParse(object) : null
  const id = parsed?.success ? parseItemId(parsed.data.id) : null
  if (!id) return { error: MESSAGES.confirm }
  const result = await attempt('delete', () => deleteMenuItem(getPool(), admin.adminUserId, id))
  if (result === 'failed') return { error: MESSAGES.failed }
  if (result.status === 'not_found') return { error: MESSAGES.notFound }
  await discardMenuPhoto(result.removedImageKey)
  done(result.categoryKey)
  return { error: null }
}

const removePhotoSchema = z.strictObject({ id: z.string() })

export async function removePhoto(formData: FormData) {
  const admin = await requireAdmin()
  const object = formDataToObject(formData)
  const parsed = object ? removePhotoSchema.safeParse(object) : null
  const id = parsed?.success ? parseItemId(parsed.data.id) : null
  if (!id) return fail('invalide')
  const result = await attempt('remove photo', () => removeMenuItemPhoto(getPool(), admin.adminUserId, id))
  if (result === 'failed') return fail('echec')
  if (result.status === 'not_found') return fail('introuvable')
  await discardMenuPhoto(result.removedImageKey)
  revalidatePath('/admin')
  redirect(`/admin/menu/${id}`)
}

const flagSchema = z.strictObject({ id: z.string(), flag: z.enum(['available', 'visible']), value: z.enum(['0', '1']) })

export async function setFlag(formData: FormData): Promise<ListActionResult> {
  const admin = await requireAdmin()
  const object = formDataToObject(formData)
  const parsed = object ? flagSchema.safeParse(object) : null
  const id = parsed?.success ? parseItemId(parsed.data.id) : null
  if (!parsed?.success || !id) return 'invalid'
  const { flag, value } = parsed.data
  return listResult(await mutate('set flag', () => setMenuItemFlag(getPool(), admin.adminUserId, id, flag, value === '1')))
}

const moveSchema = z.strictObject({ id: z.string(), direction: z.enum(['up', 'down']) })

export async function moveItem(formData: FormData): Promise<ListActionResult> {
  const admin = await requireAdmin()
  const object = formDataToObject(formData)
  const parsed = object ? moveSchema.safeParse(object) : null
  const id = parsed?.success ? parseItemId(parsed.data.id) : null
  if (!parsed?.success || !id) return 'invalid'
  const { direction } = parsed.data
  return listResult(await mutate('move', () => moveMenuItem(getPool(), admin.adminUserId, id, direction)))
}

const reorderSchema = z.strictObject({ id: z.string(), position: z.string().regex(/^\d{1,4}$/) })

// Drag and drop within a category.
export async function reorderItem(formData: FormData): Promise<ListActionResult> {
  const admin = await requireAdmin()
  const object = formDataToObject(formData)
  const parsed = object ? reorderSchema.safeParse(object) : null
  const id = parsed?.success ? parseItemId(parsed.data.id) : null
  if (!parsed?.success || !id) return 'invalid'
  const position = Number(parsed.data.position)
  return listResult(await mutate('reorder', () => moveMenuItemTo(getPool(), admin.adminUserId, id, position)))
}

function listResult(result: 'ok' | 'not_found' | 'failed'): ListActionResult {
  if (result === 'ok') revalidatePath('/admin')
  return result
}
