// Browser-side preparation of a menu photo before upload (admin form). The server never trusts the result:
// it decodes it again with Sharp, strips metadata and builds the final variants itself.
//
// Any photo the browser can decode is accepted. HEIC/HEIF (iPhone) is decoded natively by Safari; elsewhere it
// is converted by heic-to (libheif compiled to JS), loaded only when such a file is actually chosen.
import { MAX_SOURCE_BYTES, MIN_PHOTO_SIDE } from './limits'

// Longest side sent to the server: far above the 320 px final variant, far below a 12-48 MP phone photo.
export const PREPARED_MAX_SIDE = 2048
export const PREPARED_TYPE = 'image/jpeg'
const PREPARED_QUALITY = 0.85

export type PrepareError = 'too_large' | 'unreadable' | 'too_small' | 'conversion_failed'
export type PreparedPhoto = { ok: true; blob: Blob; width: number; height: number } | { ok: false; error: PrepareError }

// ISO-BMFF brands of HEIF images (HEVC-coded or generic). AVIF is decoded natively by current browsers.
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'])

export function isHeif(header: Uint8Array) {
  if (header.length < 16) return false
  const text = (start: number, end: number) => String.fromCharCode(...header.subarray(start, end))
  if (text(4, 8) !== 'ftyp') return false
  const boxSize = Math.min(new DataView(header.buffer, header.byteOffset).getUint32(0), header.length)
  const brands = [text(8, 12)]
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) brands.push(text(offset, offset + 4))
  return !brands.includes('avif') && brands.some((brand) => HEIF_BRANDS.has(brand))
}

// A drawing, not a photo: always refused, even where the browser could rasterize it. Raster image formats never
// start with '<', so markup is caught whatever type or extension it is sent under.
export function isSvg(type: string, header: Uint8Array) {
  if (type === 'image/svg+xml') return true
  let i = header[0] === 0xef && header[1] === 0xbb && header[2] === 0xbf ? 3 : 0
  while (i < header.length && [0x09, 0x0a, 0x0d, 0x20].includes(header[i])) i++
  return header[i] === 0x3c
}

// Keeps the aspect ratio: the square crop is done on the server.
export function fitWithin(width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

// 'from-image' applies the EXIF orientation of JPEG files; HEIF rotations are applied by the decoder.
async function decodeNatively(file: Blob) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return null
  }
}

async function decodeHeif(file: Blob) {
  try {
    const { heicTo } = await import('heic-to/csp')
    return await heicTo({ blob: file, type: 'bitmap' })
  } catch {
    return null
  }
}

async function encode(bitmap: ImageBitmap, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null
  // Transparent areas (PNG) become white instead of black in the JPEG.
  context.fillStyle = '#fff'
  context.fillRect(0, 0, width, height)
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, width, height)
  try {
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, PREPARED_TYPE, PREPARED_QUALITY))
  } finally {
    // Frees the pixel buffer right away (matters on phones).
    canvas.width = 0
    canvas.height = 0
  }
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (file.size > MAX_SOURCE_BYTES) return { ok: false, error: 'too_large' }
  const header = new Uint8Array(await file.slice(0, 64).arrayBuffer())
  if (isSvg(file.type, header)) return { ok: false, error: 'unreadable' }
  let bitmap = await decodeNatively(file)
  if (!bitmap) {
    if (!isHeif(header)) return { ok: false, error: 'unreadable' }
    bitmap = await decodeHeif(file)
    if (!bitmap) return { ok: false, error: 'conversion_failed' }
  }
  try {
    if (Math.min(bitmap.width, bitmap.height) < MIN_PHOTO_SIDE) return { ok: false, error: 'too_small' }
    const size = fitWithin(bitmap.width, bitmap.height, PREPARED_MAX_SIDE)
    const blob = await encode(bitmap, size.width, size.height).catch(() => null)
    return blob ? { ok: true, blob, ...size } : { ok: false, error: 'conversion_failed' }
  } finally {
    bitmap.close()
  }
}
