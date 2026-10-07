import type { StorePhotoError } from './menu-photos'

// Error codes returned by POST /api/admin/menu/<id>/photo, shown on the item page (?photo=<code>).
export type PhotoUploadError = StorePhotoError | 'bad_request' | 'not_found'

export const PHOTO_ERRORS: Record<PhotoUploadError, string> = {
  too_large: 'La photo dépasse 10 Mo : choisissez une image plus légère.',
  unsupported: 'Format non pris en charge : envoyez une photo JPEG, PNG ou WebP.',
  heic: 'Les photos HEIC ne sont pas prises en charge. Sur iPhone, envoyez la photo depuis Safari (elle est alors convertie en JPEG) ou choisissez « Le plus compatible » dans Réglages > Appareil photo > Formats.',
  too_many_pixels: 'La photo est trop grande : 50 mégapixels maximum.',
  too_small: 'La photo est trop petite : au moins 320 × 320 pixels.',
  corrupt: 'La photo est illisible ou endommagée.',
  rate_limited: 'Trop de photos envoyées en peu de temps. Réessayez dans quelques minutes.',
  failed: 'La photo n’a pas pu être enregistrée. Réessayez dans un instant.',
  bad_request: 'La photo n’a pas pu être envoyée. Réessayez dans un instant.',
  not_found: 'Cet élément n’existe plus : il a peut-être été supprimé entre-temps.',
}

export const isPhotoUploadError = (value: unknown): value is PhotoUploadError =>
  typeof value === 'string' && Object.hasOwn(PHOTO_ERRORS, value)
