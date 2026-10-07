// Shared with the admin form (client bundle): no server import here.
// Menu photos are shown as square thumbnails (64 px in the list): 160 for 1x/2x, 320 for 3x screens.
export const PHOTO_SIZES = [160, 320] as const
export type PhotoSize = (typeof PHOTO_SIZES)[number]
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp'
