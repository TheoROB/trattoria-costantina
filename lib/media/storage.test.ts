import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  cleanupOrphans,
  deleteVariants,
  newImageKey,
  parseVariantFileName,
  readVariant,
  resolveMediaRoot,
  variantUrl,
  writeVariants,
} from './storage'

const variants = (tag: string) => [
  { size: 160 as const, data: Buffer.from(`${tag}-160`) },
  { size: 320 as const, data: Buffer.from(`${tag}-320`) },
]

let root: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'media-test-'))
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('resolveMediaRoot', () => {
  const cwd = '/home/u1/domains/example.fr/hbuilds/versions/42/nodejs'

  it('accepts an absolute directory outside the application', () => {
    expect(resolveMediaRoot('/home/u1/domains/example.fr/trattoria-media', cwd)).toBe('/home/u1/domains/example.fr/trattoria-media')
    expect(resolveMediaRoot('/tmp/media/', '/repo')).toBe('/tmp/media')
  })

  it.each([
    [undefined, 'not set'],
    ['', 'not set'],
    ['media', 'absolute'],
    ['/', 'root'],
    [cwd, 'inside'],
    [`${cwd}/public/media`, 'inside'],
    [`${cwd}/.next/media`, 'inside'],
    ['/home/u1/domains/example.fr/hbuilds/media', 'hbuilds'],
    ['/home/u1/domains/example.fr/hbuilds/../hbuilds/media', 'hbuilds'],
  ])('refuses %s', (value, reason) => {
    expect(() => resolveMediaRoot(value, cwd)).toThrow(reason)
  })
})

describe('variant names', () => {
  it('generates 32 hex character keys that never repeat', () => {
    const keys = new Set(Array.from({ length: 1000 }, newImageKey))
    expect(keys.size).toBe(1000)
    for (const key of keys) expect(key).toMatch(/^[a-f0-9]{32}$/)
  })

  it('parses only server-generated file names', () => {
    const key = newImageKey()
    expect(parseVariantFileName(`${key}-160.webp`)).toEqual({ key, size: 160 })
    expect(parseVariantFileName(`${key}-320.webp`)).toEqual({ key, size: 320 })
    for (const bad of [
      `${key}-640.webp`,
      `${key}-160.png`,
      `${key.toUpperCase()}-160.webp`,
      `../${key}-160.webp`,
      `${key}-160.webp/..`,
      `..%2F${key}-160.webp`,
      '../../etc/passwd',
      `${key}-160.webp\u0000.png`,
      '',
    ]) {
      expect(parseVariantFileName(bad), bad).toBeNull()
    }
  })

  it('builds the public URL from the key only', () => {
    expect(variantUrl('0123456789abcdef0123456789abcdef', 160)).toBe('/media/menu/0123456789abcdef0123456789abcdef-160.webp')
    expect(() => variantUrl('../etc', 160)).toThrow()
  })
})

describe('writeVariants / readVariant / deleteVariants', () => {
  it('writes every variant under <root>/menu and reads them back by file name', async () => {
    const key = newImageKey()
    await writeVariants(root, key, variants('a'))
    expect(fs.readdirSync(path.join(root, 'menu')).sort()).toEqual([`${key}-160.webp`, `${key}-320.webp`])
    expect((await readVariant(root, `${key}-320.webp`))?.toString()).toBe('a-320')
  })

  it('never overwrites an existing file (key collision) and leaves the first upload intact', async () => {
    const key = newImageKey()
    await writeVariants(root, key, variants('first'))
    await expect(writeVariants(root, key, variants('second'))).rejects.toMatchObject({ code: 'EEXIST' })
    expect((await readVariant(root, `${key}-160.webp`))?.toString()).toBe('first-160')
    expect((await readVariant(root, `${key}-320.webp`))?.toString()).toBe('first-320')
  })

  it('removes the files it wrote when a later variant fails', async () => {
    const key = newImageKey()
    fs.mkdirSync(path.join(root, 'menu'))
    // A directory where the 320 file should go makes the second write fail.
    fs.mkdirSync(path.join(root, 'menu', `${key}-320.webp`))
    await expect(writeVariants(root, key, variants('a'))).rejects.toThrow()
    expect(fs.existsSync(path.join(root, 'menu', `${key}-160.webp`))).toBe(false)
  })

  it('refuses keys that are not server-generated', async () => {
    await expect(writeVariants(root, '../../escape', variants('a'))).rejects.toThrow('Invalid image key')
    expect(fs.existsSync(path.join(root, 'escape-160.webp'))).toBe(false)
  })

  it('returns null for unknown or invalid names instead of touching the filesystem', async () => {
    fs.writeFileSync(path.join(root, 'secret.txt'), 'secret')
    expect(await readVariant(root, '../secret.txt')).toBeNull()
    expect(await readVariant(root, `${newImageKey()}-160.webp`)).toBeNull()
  })

  it('deletes every variant of a key and ignores missing files', async () => {
    const key = newImageKey()
    const other = newImageKey()
    await writeVariants(root, key, variants('a'))
    await writeVariants(root, other, variants('b'))
    await deleteVariants(root, key)
    await deleteVariants(root, key)
    expect(fs.readdirSync(path.join(root, 'menu')).sort()).toEqual([`${other}-160.webp`, `${other}-320.webp`])
  })
})

describe('cleanupOrphans', () => {
  const age = (file: string, ms: number) => {
    const time = new Date(Date.now() - ms)
    fs.utimesSync(file, time, time)
  }

  it('deletes old unreferenced variants and keeps referenced or recent ones', async () => {
    const [referenced, orphan, recent] = [newImageKey(), newImageKey(), newImageKey()]
    for (const key of [referenced, orphan, recent]) await writeVariants(root, key, variants(key))
    for (const key of [referenced, orphan]) {
      for (const size of [160, 320]) age(path.join(root, 'menu', `${key}-${size}.webp`), 2 * 3600_000)
    }
    fs.writeFileSync(path.join(root, 'menu', 'notes.txt'), 'not ours')
    age(path.join(root, 'menu', 'notes.txt'), 2 * 3600_000)

    let asked: string[] = []
    const removed = await cleanupOrphans(root, async (keys) => {
      asked = keys
      return new Set(keys.filter((k) => k === referenced))
    })

    expect(asked.sort()).toEqual([referenced, orphan].sort())
    expect(removed).toBe(2)
    expect(fs.readdirSync(path.join(root, 'menu')).sort()).toEqual(
      [`${referenced}-160.webp`, `${referenced}-320.webp`, `${recent}-160.webp`, `${recent}-320.webp`, 'notes.txt'].sort(),
    )
  })

  it('does nothing when the media directory does not exist yet', async () => {
    expect(await cleanupOrphans(path.join(root, 'missing'), async () => new Set())).toBe(0)
  })
})
