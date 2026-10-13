// Shared with the admin form (client bundle): no server import here.
// Menu photos are shown as square thumbnails (64 px in the list): 160 for 1x/2x, 320 for 3x screens.
export const PHOTO_SIZES = [160, 320] as const
export type PhotoSize = (typeof PHOTO_SIZES)[number]
// Upload payload checked by the server. The browser sends a prepared JPEG of a few hundred KB.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
// Shortest side below which a photo is unusable, even as a thumbnail (the 320 variant is upscaled).
export const MIN_PHOTO_SIDE = 200
// Original file chosen in the browser, before preparation.
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024
export const PHOTO_ACCEPT = 'image/*'
