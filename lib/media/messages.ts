import type { StorePhotoError } from './menu-photos'
import type { PrepareError } from './prepare-photo'

// Error codes returned by POST /api/admin/menu/<id>/photo, shown on the item page (?photo=<code>).
export type PhotoUploadError = StorePhotoError | 'bad_request' | 'not_found'

// Plain words for the person adding the photo: no format or codec names.
const UNREADABLE = 'Cette photo n’a pas pu être lue. Essayez avec une autre photo.'
const TOO_LARGE = 'Cette photo est exceptionnellement volumineuse. Choisissez une autre photo.'
const TOO_SMALL = 'Cette photo est trop petite pour être affichée correctement. Choisissez une photo plus grande.'
const NOT_CONVERTED = 'Cette photo n’a pas pu être convertie. Essayez avec une autre photo, ou une capture d’écran de celle-ci.'

export const PHOTO_ERRORS: Record<PhotoUploadError, string> = {
  too_large: TOO_LARGE,
  unsupported: UNREADABLE,
  heic: NOT_CONVERTED,
  too_many_pixels: TOO_LARGE,
  too_small: TOO_SMALL,
  corrupt: UNREADABLE,
  rate_limited: 'Trop de photos envoyées en peu de temps. Réessayez dans quelques minutes.',
  failed: 'La photo n’a pas pu être enregistrée. Réessayez dans un instant.',
  bad_request: 'La photo n’a pas pu être envoyée. Réessayez dans un instant.',
  not_found: 'Cet élément n’existe plus : il a peut-être été supprimé entre-temps.',
}

// Shown under the photo field when the browser cannot prepare the chosen file.
export const PREPARE_ERRORS: Record<PrepareError, string> = {
  too_large: TOO_LARGE,
  unreadable: UNREADABLE,
  too_small: TOO_SMALL,
  conversion_failed: NOT_CONVERTED,
}

export const isPhotoUploadError = (value: unknown): value is PhotoUploadError =>
  typeof value === 'string' && Object.hasOwn(PHOTO_ERRORS, value)
