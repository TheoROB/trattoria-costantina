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
  removeMenuItemPhoto,
  setMenuItemFlag,
  updateMenuItem,
} from '@/lib/menu/admin'
import { formDataToObject, parseItemId, parseMenuItemForm, type FieldName } from '@/lib/menu/admin-input'
import { cleanupMenuPhotos, discardMenuPhoto, storeMenuPhoto, takePhoto, type StorePhotoError } from '@/lib/media/menu-photos'

export type FormFieldName = FieldName | 'photo'

export type ItemFormState = {
  error: string | null
  fieldErrors?: Partial<Record<FormFieldName, string>>
  // Submitted text, echoed back so the form keeps what was typed after a validation error.
  values?: Record<string, string>
}

const MESSAGES = {
  invalid: 'Certains champs sont invalides : corrigez-les puis enregistrez.',
  notFound: 'Cet élément n’existe plus : il a peut-être été supprimé entre-temps.',
  failed: 'L’enregistrement a échoué. Réessayez dans un instant.',
  confirm: 'Cochez la case de confirmation pour supprimer cet élément.',
}

const PHOTO_ERRORS: Record<StorePhotoError | 'multiple', string> = {
  too_large: 'La photo dépasse 10 Mo : choisissez une image plus légère.',
  unsupported: 'Format non pris en charge : envoyez une photo JPEG, PNG ou WebP.',
  heic: 'Les photos HEIC ne sont pas prises en charge. Sur iPhone, envoyez la photo depuis Safari (elle est alors convertie en JPEG) ou choisissez « Le plus compatible » dans Réglages > Appareil photo > Formats.',
  too_many_pixels: 'La photo est trop grande : 50 mégapixels maximum.',
  too_small: 'La photo est trop petite : au moins 320 × 320 pixels.',
  corrupt: 'La photo est illisible ou endommagée.',
  rate_limited: 'Trop de photos envoyées en peu de temps. Réessayez dans quelques minutes.',
  failed: 'La photo n’a pas pu être enregistrée. Réessayez dans un instant.',
  multiple: 'Envoyez une seule photo.',
}
// The selected file cannot be kept by the browser after a failed submission.
const PHOTO_RESELECT = ' Sélectionnez à nouveau la photo si besoin.'

const ECHOED_FIELDS = ['category', 'name', 'description', 'price', 'isAvailable', 'isVisible']
const echo = (formData: FormData) =>
  Object.fromEntries(ECHOED_FIELDS.map((k) => [k, String(formData.get(k) ?? '').slice(0, 500)]))

async function mutate(operation: string, work: () => Promise<unknown>) {
  try {
    const result = await work()
    if (result === 'not_found' || (result as { status?: string })?.status === 'not_found') return 'not_found'
    return 'ok'
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

type PhotoStep = { ok: true; key: string | null } | { ok: false; state: ItemFormState }

// Runs after the text fields are valid, so an invalid form never costs an image decode.
async function storePhotoIfAny(adminUserId: number, file: File | null, formData: FormData): Promise<PhotoStep> {
  if (!file) return { ok: true, key: null }
  const stored = await storeMenuPhoto(getPool(), adminUserId, file)
  if (stored.ok) return { ok: true, key: stored.key }
  const state = { error: MESSAGES.invalid + PHOTO_RESELECT, fieldErrors: { photo: PHOTO_ERRORS[stored.error] }, values: echo(formData) }
  return { ok: false, state }
}

function invalidForm(formData: FormData, fieldErrors: ItemFormState['fieldErrors'], photoOk: boolean): ItemFormState {
  const errors = photoOk ? fieldErrors : { ...fieldErrors, photo: PHOTO_ERRORS.multiple }
  return { error: MESSAGES.invalid + PHOTO_RESELECT, fieldErrors: errors, values: echo(formData) }
}

function done() {
  revalidatePath('/admin')
  redirect('/admin')
}

// List page actions report errors through a closed set of query values.
const fail = (code: 'introuvable' | 'echec' | 'invalide') => redirect(`/admin?erreur=${code}`)

export async function createItem(_previous: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const admin = await requireAdmin()
  const photo = takePhoto(formData)
  const parsed = parseMenuItemForm(formData)
  if (!photo.ok || !parsed.ok) return invalidForm(formData, parsed.ok ? {} : parsed.fieldErrors, photo.ok)
  const stored = await storePhotoIfAny(admin.adminUserId, photo.file, formData)
  if (!stored.ok) return stored.state
  const result = await mutate('create', () => createMenuItem(getPool(), admin.adminUserId, parsed.data, stored.key))
  if (result !== 'ok') {
    await discardMenuPhoto(stored.key)
    return { error: MESSAGES.failed, values: echo(formData) }
  }
  if (stored.key) await cleanupMenuPhotos(getPool())
  done()
  return { error: null }
}

export async function updateItem(_previous: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const admin = await requireAdmin()
  const id = parseItemId(formData.get('id'))
  formData.delete('id')
  const photo = takePhoto(formData)
  const parsed = parseMenuItemForm(formData)
  if (!id || !photo.ok || !parsed.ok) return invalidForm(formData, parsed.ok ? {} : parsed.fieldErrors, photo.ok)
  const stored = await storePhotoIfAny(admin.adminUserId, photo.file, formData)
  if (!stored.ok) return stored.state
  // The previous photo is deleted only once the new one is committed; on failure the new files go.
  const result = await attempt('update', () => updateMenuItem(getPool(), admin.adminUserId, id, parsed.data, stored.key))
  if (result === 'failed' || result.status === 'not_found') {
    await discardMenuPhoto(stored.key)
    return { error: result === 'failed' ? MESSAGES.failed : MESSAGES.notFound, values: echo(formData) }
  }
  await discardMenuPhoto(result.removedImageKey)
  if (stored.key) await cleanupMenuPhotos(getPool())
  done()
  return { error: null }
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
  done()
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

export async function setFlag(formData: FormData) {
  const admin = await requireAdmin()
  const object = formDataToObject(formData)
  const parsed = object ? flagSchema.safeParse(object) : null
  const id = parsed?.success ? parseItemId(parsed.data.id) : null
  if (!parsed?.success || !id) return fail('invalide')
  const { flag, value } = parsed.data
  const result = await mutate('set flag', () => setMenuItemFlag(getPool(), admin.adminUserId, id, flag, value === '1'))
  if (result === 'not_found') return fail('introuvable')
  if (result === 'failed') return fail('echec')
  done()
}

const moveSchema = z.strictObject({ id: z.string(), direction: z.enum(['up', 'down']) })

export async function moveItem(formData: FormData) {
  const admin = await requireAdmin()
  const object = formDataToObject(formData)
  const parsed = object ? moveSchema.safeParse(object) : null
  const id = parsed?.success ? parseItemId(parsed.data.id) : null
  if (!parsed?.success || !id) return fail('invalide')
  const { direction } = parsed.data
  const result = await mutate('move', () => moveMenuItem(getPool(), admin.adminUserId, id, direction))
  if (result === 'not_found') return fail('introuvable')
  if (result === 'failed') return fail('echec')
  done()
}
