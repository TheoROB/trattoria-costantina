#!/usr/bin/env node
// Builds the responsive image variants served from public/images (local only, never at runtime).
//
// Usage: node scripts/optimize-images.mjs --source "<photos directory>"
//    or: PHOTOS_DIR="<photos directory>" node scripts/optimize-images.mjs
//
// Reads scripts/images.config.json, then for each key: auto-orients the source, strips all
// metadata (EXIF/GPS), crops, resizes and writes public/images/<key>/<width>.<ext>.
// Writes public/images/manifest.json with the dimensions of every variant.
// Output depends only on the config and the source files, so re-running is idempotent.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public/images')

const ENCODERS = {
  avif: (img) => img.avif({ quality: 50, effort: 6, chromaSubsampling: '4:2:0' }),
  webp: (img) => img.webp({ quality: 68, effort: 6, smartSubsample: true }),
  png: (img) => img.png({ compressionLevel: 9, palette: true, effort: 10 }),
}

const { values } = parseArgs({ options: { source: { type: 'string' } } })
const sourceDir = values.source ?? process.env.PHOTOS_DIR
const config = JSON.parse(await readFile(path.join(root, 'scripts/images.config.json'), 'utf8'))

function resolveSource(source) {
  if (source.startsWith('repo:')) return path.join(root, source.slice('repo:'.length))
  if (!sourceDir) throw new Error('Missing photos directory: pass --source <dir> or set PHOTOS_DIR')
  return path.join(sourceDir, source)
}

async function load(entry) {
  // rotate() with no argument applies the EXIF orientation; metadata is dropped on output by default.
  // Decoded to raw pixels so that no intermediate lossy encoding happens.
  const { data, info } = await sharp(resolveSource(entry.source)).rotate().raw().toBuffer({ resolveWithObject: true })
  const raw = { width: info.width, height: info.height, channels: info.channels }
  if (!entry.crop) return { data, raw, width: info.width, height: info.height }
  const c = entry.crop
  const region = {
    left: Math.round(c.left * info.width),
    top: Math.round(c.top * info.height),
    width: Math.round(c.width * info.width),
    height: Math.round(c.height * info.height),
  }
  region.width = Math.min(region.width, info.width - region.left)
  region.height = Math.min(region.height, info.height - region.top)
  const cropped = await sharp(data, { raw }).extract(region).raw().toBuffer()
  return {
    data: cropped,
    raw: { width: region.width, height: region.height, channels: info.channels },
    width: region.width,
    height: region.height,
  }
}

const manifest = {}
for (const [key, entry] of Object.entries(config.images)) {
  const base = await load(entry)
  const dir = path.join(outDir, key)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })

  const variants = []
  for (const width of entry.widths) {
    if (width > base.width) throw new Error(`${key}: ${width}px exceeds the source width (${base.width}px)`)
    const height = Math.round((base.height * width) / base.width)
    for (const format of entry.formats) {
      const file = path.join(dir, `${width}.${format}`)
      await ENCODERS[format](sharp(base.data, { raw: base.raw }).resize(width, height, { kernel: 'lanczos3' })).toFile(file)
    }
    variants.push({ width, height })
  }
  manifest[key] = { formats: entry.formats, variants }
  console.log(`${key}: ${variants.map((v) => `${v.width}x${v.height}`).join(', ')}`)
}

await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
