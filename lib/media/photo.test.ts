import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { MAX_UPLOAD_BYTES, PHOTO_SIZES, processMenuPhoto } from './photo'

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#c47a3a' } })

// Left half red, right half blue.
async function halves(width: number, height: number) {
  const half = Math.round(width / 2)
  const blue = await sharp({ create: { width: width - half, height, channels: 3, background: '#0000ff' } }).png().toBuffer()
  return sharp({ create: { width, height, channels: 3, background: '#ff0000' } }).composite([{ input: blue, left: half, top: 0 }])
}

async function expectRejected(input: Buffer, error: string) {
  const result = await processMenuPhoto(input)
  expect(result).toEqual({ ok: false, error })
}

describe('processMenuPhoto', () => {
  it.each([
    ['JPEG', () => solid(1200, 900).jpeg().toBuffer()],
    ['PNG', () => solid(800, 800).png().toBuffer()],
    ['WebP', () => solid(640, 480).webp().toBuffer()],
  ])('turns a valid %s into square WebP variants', async (_format, make) => {
    const result = await processMenuPhoto(await make())
    if (!result.ok) throw new Error(result.error)
    expect(result.variants.map((v) => v.size)).toEqual([...PHOTO_SIZES])
    for (const variant of result.variants) {
      const meta = await sharp(variant.data).metadata()
      expect(meta.format).toBe('webp')
      expect([meta.width, meta.height]).toEqual([variant.size, variant.size])
    }
  })

  it('strips EXIF, ICC and XMP metadata and applies the EXIF orientation', async () => {
    // Stored sideways: orientation 6 means "rotate 90° clockwise to display".
    const input = await (await halves(800, 400))
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExif({ IFD0: { Copyright: 'secret-owner', Make: 'PhoneMaker' }, IFD3: { GPSLatitudeRef: 'N' } })
      .toBuffer()
    expect((await sharp(input).metadata()).exif).toBeDefined()

    const result = await processMenuPhoto(input)
    if (!result.ok) throw new Error(result.error)
    for (const variant of result.variants) {
      const meta = await sharp(variant.data).metadata()
      expect(meta.exif).toBeUndefined()
      expect(meta.icc).toBeUndefined()
      expect(meta.xmp).toBeUndefined()
      expect(meta.orientation).toBeUndefined()
      expect(variant.data.includes('secret-owner')).toBe(false)
    }
    // After rotation the red half is on top and the blue half at the bottom.
    const { data, info } = await sharp(result.variants[1].data).raw().toBuffer({ resolveWithObject: true })
    const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)]
    const [top, bottom] = [pixel(info.width / 2, 10), pixel(info.width / 2, info.height - 10)]
    expect(top[0]).toBeGreaterThan(200)
    expect(top[2]).toBeLessThan(60)
    expect(bottom[2]).toBeGreaterThan(200)
    expect(bottom[0]).toBeLessThan(60)
  })

  it('rejects a text file named like a JPEG', async () => {
    await expectRejected(Buffer.from('this is not an image, whatever the .jpg extension says'), 'unsupported')
  })

  it('rejects a fake JPEG whose header is valid but whose data is garbage', async () => {
    const real = await solid(800, 600).jpeg().toBuffer()
    const broken = Buffer.concat([real.subarray(0, 400), Buffer.alloc(4000, 0x41)])
    await expectRejected(broken, 'corrupt')
  })

  it('rejects SVG even though Sharp can decode it', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><script>alert(1)</script><rect width="800" height="800"/></svg>')
    await expectRejected(svg, 'unsupported')
  })

  it.each([
    ['GIF', () => solid(800, 800).gif().toBuffer()],
    ['TIFF', () => solid(800, 800).tiff().toBuffer()],
    ['AVIF', () => solid(800, 800).avif().toBuffer()],
  ])('rejects %s (only JPEG, PNG and WebP are accepted)', async (_format, make) => {
    await expectRejected(await make(), 'unsupported')
  })

  it('rejects HEIC with a dedicated error', async () => {
    // ISO-BMFF header with the "heic" brand, as sent by an iPhone that does not convert.
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.from([0, 0, 0, 0]), Buffer.from('mif1heic'), Buffer.alloc(200)])
    await expectRejected(heic, 'heic')
  })

  it('rejects files over the size limit without decoding them', async () => {
    await expectRejected(Buffer.alloc(MAX_UPLOAD_BYTES + 1), 'too_large')
  })

  it('rejects images over 50 megapixels from their header', async () => {
    await expectRejected(await solid(10000, 5001).jpeg({ quality: 10 }).toBuffer(), 'too_many_pixels')
  })

  it('rejects images smaller than the largest variant', async () => {
    await expectRejected(await solid(1000, 300).jpeg().toBuffer(), 'too_small')
  })

  it('rejects an empty buffer', async () => {
    await expectRejected(Buffer.alloc(0), 'unsupported')
  })
})
