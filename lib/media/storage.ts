import 'server-only'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PHOTO_SIZES, type PhotoSize } from './limits'

// Files live in <MEDIA_ROOT>/menu/<key>-<size>.webp. The key is generated here; the database stores
// only the key (menu_items.image_key), never a path or a user-supplied name.
const KEY = /^[a-f0-9]{32}$/
const FILE_NAME = /^([a-f0-9]{32})-(\d{3})\.webp$/
const SUBDIR = 'menu'
// Files younger than this may belong to an upload whose database write has not committed yet.
const ORPHAN_MIN_AGE_MS = 3600_000

export const newImageKey = () => randomBytes(16).toString('hex')

function assertKey(key: string) {
  if (!KEY.test(key)) throw new Error('Invalid image key')
}

const fileName = (key: string, size: PhotoSize) => `${key}-${size}.webp`

export function variantUrl(key: string, size: PhotoSize) {
  assertKey(key)
  return `/media/${SUBDIR}/${fileName(key, size)}`
}

export function parseVariantFileName(name: string): { key: string; size: PhotoSize } | null {
  const match = FILE_NAME.exec(name)
  const size = match ? (Number(match[2]) as PhotoSize) : null
  return match && size && PHOTO_SIZES.includes(size) ? { key: match[1], size } : null
}

// MEDIA_ROOT must be an absolute directory outside the application: never public/, .next/, the Git
// checkout or Hostinger's hbuilds/ (replaced at every deployment).
export function resolveMediaRoot(value: string | undefined, cwd: string) {
  if (!value) throw new Error('MEDIA_ROOT is not set')
  if (!path.isAbsolute(value)) throw new Error('MEDIA_ROOT must be an absolute path')
  const root = path.resolve(value)
  if (root === path.parse(root).root) throw new Error('MEDIA_ROOT must not be the filesystem root')
  const app = path.resolve(cwd)
  if (root === app || root.startsWith(app + path.sep)) throw new Error('MEDIA_ROOT must not be inside the application directory')
  if (root.split(path.sep).includes('hbuilds')) throw new Error('MEDIA_ROOT must not be inside hbuilds')
  return root
}

export const mediaRoot = () => resolveMediaRoot(process.env.MEDIA_ROOT, process.cwd())

// All or nothing. 'wx' never overwrites an existing file, so two uploads can never share a file.
export async function writeVariants(root: string, key: string, variants: { size: PhotoSize; data: Buffer }[]) {
  assertKey(key)
  const dir = path.join(root, SUBDIR)
  await fs.mkdir(dir, { recursive: true, mode: 0o750 })
  const written: string[] = []
  try {
    for (const { size, data } of variants) {
      const file = path.join(dir, fileName(key, size))
      await fs.writeFile(file, data, { flag: 'wx', mode: 0o640 })
      written.push(file)
    }
  } catch (error) {
    await Promise.all(written.map((file) => fs.rm(file, { force: true })))
    throw error
  }
}

export async function deleteVariants(root: string, key: string) {
  assertKey(key)
  await Promise.all(PHOTO_SIZES.map((size) => fs.rm(path.join(root, SUBDIR, fileName(key, size)), { force: true })))
}

// The path is rebuilt from the parsed key and size, never from the requested name.
export async function readVariant(root: string, name: string) {
  const parsed = parseVariantFileName(name)
  if (!parsed) return null
  try {
    return await fs.readFile(path.join(root, SUBDIR, fileName(parsed.key, parsed.size)))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

// Removes variants left behind by an interrupted upload or replacement. Returns the number of files deleted.
export async function cleanupOrphans(root: string, referencedKeys: (keys: string[]) => Promise<Set<string>>) {
  const dir = path.join(root, SUBDIR)
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0
    throw error
  }
  const old: { file: string; key: string }[] = []
  for (const name of names) {
    const parsed = parseVariantFileName(name)
    if (!parsed) continue
    const file = path.join(dir, name)
    const stat = await fs.stat(file).catch(() => null)
    if (stat && Date.now() - stat.mtimeMs > ORPHAN_MIN_AGE_MS) old.push({ file, key: parsed.key })
  }
  if (old.length === 0) return 0
  const referenced = await referencedKeys([...new Set(old.map((o) => o.key))])
  const orphans = old.filter((o) => !referenced.has(o.key))
  await Promise.all(orphans.map((o) => fs.rm(o.file, { force: true })))
  return orphans.length
}
