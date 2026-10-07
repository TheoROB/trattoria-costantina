import 'server-only'
import sharp, { type Metadata } from 'sharp'
import { MAX_UPLOAD_BYTES, PHOTO_SIZES, type PhotoSize } from './limits'

export { MAX_UPLOAD_BYTES, PHOTO_SIZES }

const MAX_PIXELS = 50_000_000
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp'])
// ISO-BMFF brands of HEVC-coded HEIF (iPhone photos). Sharp's prebuilt libvips only decodes AVIF.
const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs']

export type PhotoError = 'too_large' | 'unsupported' | 'heic' | 'too_many_pixels' | 'too_small' | 'corrupt'
export type PhotoResult = { ok: true; variants: { size: PhotoSize; data: Buffer }[] } | { ok: false; error: PhotoError }

// Decoding is memory hungry: no pixel cache, and one photo at a time per process.
sharp.cache(false)
let queue: Promise<unknown> = Promise.resolve()

function isHeic(input: Buffer) {
  if (input.length < 16 || input.toString('latin1', 4, 8) !== 'ftyp') return false
  const boxSize = Math.min(input.readUInt32BE(0), input.length, 64)
  const brands = input.toString('latin1', 8, boxSize)
  return HEIC_BRANDS.some((brand) => brands.includes(brand))
}

async function process(input: Buffer): Promise<PhotoResult> {
  if (input.length > MAX_UPLOAD_BYTES) return { ok: false, error: 'too_large' }
  if (isHeic(input)) return { ok: false, error: 'heic' }

  // The format comes from the decoder reading the file header, never from a name or a MIME type.
  let meta: Metadata
  try {
    meta = await sharp(input).metadata()
  } catch {
    return { ok: false, error: 'unsupported' }
  }
  if (!ACCEPTED_FORMATS.has(meta.format)) return { ok: false, error: 'unsupported' }
  if (meta.width * meta.height > MAX_PIXELS) return { ok: false, error: 'too_many_pixels' }
  if (Math.min(meta.width, meta.height) < PHOTO_SIZES[PHOTO_SIZES.length - 1]) return { ok: false, error: 'too_small' }

  try {
    // rotate() applies the EXIF orientation. Output metadata (EXIF, GPS, ICC, XMP) is dropped by default
    // and pixels are converted to sRGB. failOn 'warning' rejects truncated or corrupt data.
    const base = sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'warning' }).rotate()
    const variants = []
    for (const size of PHOTO_SIZES) {
      const data = await base.clone().resize(size, size, { fit: 'cover' }).webp({ quality: 80, effort: 4 }).toBuffer()
      variants.push({ size, data })
    }
    return { ok: true, variants }
  } catch {
    return { ok: false, error: 'corrupt' }
  }
}

export function processMenuPhoto(input: Buffer): Promise<PhotoResult> {
  const run = queue.then(() => process(input))
  queue = run.catch(() => {})
  return run
}
