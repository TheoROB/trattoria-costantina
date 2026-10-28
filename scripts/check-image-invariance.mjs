// Optional audit check: requires the explicit base Git object, unlike browser tests.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const base = process.argv[2]
if (!base) throw new Error('Usage: node scripts/check-image-invariance.mjs <base-commit>')
const files = execFileSync('git', ['ls-tree', '-r', '--name-only', base, '--',
  'public/images', 'assets/hero-table-dressee.jpg', 'components/sections/Hero.tsx'], { encoding: 'utf8' })
  .trim().split('\n').filter((file) => file && file !== 'public/images/manifest.json')
assert(files.length > 0, 'Base has no image files to compare')
for (const file of files) {
  assert(readFileSync(file).equals(execFileSync('git', ['show', `${base}:${file}`], { maxBuffer: 10 * 1024 * 1024 })), file)
}
console.log(`${files.length} existing image/hero files byte-identical to ${base}`)
