import 'server-only'
import type mysql from 'mysql2/promise'
import { referencedImageKeys } from '@/lib/menu/admin'
import { MAX_UPLOAD_BYTES } from './limits'
import { processMenuPhoto, type PhotoError } from './photo'
import { cleanupOrphans, deleteVariants, mediaRoot, newImageKey, writeVariants } from './storage'
import { allowPhotoUpload } from './upload-limit'

export type StorePhotoError = PhotoError | 'rate_limited' | 'failed'

const errorCode = (error: unknown) => (error as { code?: string }).code ?? (error as Error).message

// Takes the optional `photo` file out of the form data, so the remaining fields can be parsed strictly.
// A file input with no file selected is sent as an empty file.
export function takePhoto(formData: FormData): { ok: true; file: File | null } | { ok: false } {
  const entries = formData.getAll('photo')
  formData.delete('photo')
  if (entries.length === 0) return { ok: true, file: null }
  const [entry] = entries
  if (entries.length > 1 || typeof entry === 'string') return { ok: false }
  return { ok: true, file: entry.size === 0 ? null : entry }
}

// Validates, converts and writes the variants. The returned key is not referenced yet: the caller saves
// it in the database, or discards it if that fails.
export async function storeMenuPhoto(
  pool: mysql.Pool,
  adminUserId: number,
  file: File,
): Promise<{ ok: true; key: string } | { ok: false; error: StorePhotoError }> {
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: 'too_large' }
  try {
    const root = mediaRoot()
    if (!(await allowPhotoUpload(pool, adminUserId))) return { ok: false, error: 'rate_limited' }
    const result = await processMenuPhoto(Buffer.from(await file.arrayBuffer()))
    if (!result.ok) return result
    const key = newImageKey()
    await writeVariants(root, key, result.variants)
    return { ok: true, key }
  } catch (error) {
    console.error(`[media] photo storage failed: ${errorCode(error)}`)
    return { ok: false, error: 'failed' }
  }
}

// Best effort: files left behind are removed later by cleanupMenuPhotos.
export async function discardMenuPhoto(key: string | null) {
  if (!key) return
  try {
    await deleteVariants(mediaRoot(), key)
  } catch (error) {
    console.error(`[media] photo deletion failed: ${errorCode(error)}`)
  }
}

export async function cleanupMenuPhotos(pool: mysql.Pool) {
  try {
    await cleanupOrphans(mediaRoot(), (keys) => referencedImageKeys(pool, keys))
  } catch (error) {
    console.error(`[media] orphan cleanup failed: ${errorCode(error)}`)
  }
}
