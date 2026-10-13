import fs from 'node:fs'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { fitWithin, isHeif, isSvg, PREPARED_MAX_SIDE } from './prepare-photo'

const ftyp = (major: string, ...compatible: string[]) => {
  const size = 16 + compatible.length * 4
  const box = Buffer.alloc(size + 16)
  box.writeUInt32BE(size, 0)
  box.write(`ftyp${major}`, 4, 'latin1')
  compatible.forEach((brand, i) => box.write(brand, 16 + i * 4, 'latin1'))
  return new Uint8Array(box)
}

describe('isHeif', () => {
  it('recognises an iPhone HEIC photo', () => {
    expect(isHeif(new Uint8Array(fs.readFileSync('tests/fixtures/dish-photo.heic').subarray(0, 64)))).toBe(true)
  })

  it.each([
    ['heic', ftyp('heic', 'mif1', 'heic')],
    ['heix', ftyp('heix', 'mif1')],
    ['generic HEIF', ftyp('mif1', 'heic')],
    ['brand only in the compatible list', ftyp('isom', 'heic')],
  ])('recognises %s', (_label, header) => {
    expect(isHeif(header)).toBe(true)
  })

  it('leaves AVIF, JPEG, PNG and short or unrelated data to the browser decoder', async () => {
    expect(isHeif(ftyp('avif', 'mif1', 'miaf'))).toBe(false)
    expect(isHeif(ftyp('isom', 'mp41'))).toBe(false)
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).jpeg().toBuffer()
    expect(isHeif(new Uint8Array(jpeg.subarray(0, 64)))).toBe(false)
    expect(isHeif(new Uint8Array(Buffer.from('ftypheic')))).toBe(false)
    expect(isHeif(new Uint8Array(0))).toBe(false)
  })
})

describe('isSvg', () => {
  const bytes = (text: string) => new Uint8Array(Buffer.from(text))

  it('recognises an SVG by its declared type, whatever its content', () => {
    expect(isSvg('image/svg+xml', bytes('anything'))).toBe(true)
  })

  it.each([
    ['plain SVG', '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"/>'],
    ['XML declaration', '<?xml version="1.0"?><svg/>'],
    ['leading whitespace', '\n  <svg/>'],
    ['UTF-8 BOM', '\uFEFF<svg/>'],
  ])('recognises markup sent under another type (%s)', (_label, text) => {
    expect(isSvg('image/jpeg', bytes(text))).toBe(true)
    expect(isSvg('', bytes(text))).toBe(true)
  })

  it('leaves real photos alone', async () => {
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).jpeg().toBuffer()
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer()
    expect(isSvg('image/jpeg', new Uint8Array(jpeg.subarray(0, 64)))).toBe(false)
    expect(isSvg('image/png', new Uint8Array(png.subarray(0, 64)))).toBe(false)
    expect(isSvg('image/heic', new Uint8Array(fs.readFileSync('tests/fixtures/dish-photo.heic').subarray(0, 64)))).toBe(false)
  })
})

describe('fitWithin', () => {
  it('reduces large photos to the maximum side, keeping the ratio', () => {
    // iPhone 12 MP and 48 MP, landscape and portrait.
    expect(fitWithin(4032, 3024, PREPARED_MAX_SIDE)).toEqual({ width: 2048, height: 1536 })
    expect(fitWithin(6048, 8064, PREPARED_MAX_SIDE)).toEqual({ width: 1536, height: 2048 })
    expect(fitWithin(16320, 12240, PREPARED_MAX_SIDE)).toEqual({ width: 2048, height: 1536 })
  })

  it('never enlarges a photo already under the maximum', () => {
    expect(fitWithin(1200, 900, PREPARED_MAX_SIDE)).toEqual({ width: 1200, height: 900 })
    expect(fitWithin(2048, 2048, PREPARED_MAX_SIDE)).toEqual({ width: 2048, height: 2048 })
  })

  it('keeps at least one pixel on very elongated images', () => {
    expect(fitWithin(100000, 10, PREPARED_MAX_SIDE)).toEqual({ width: 2048, height: 1 })
  })
})
