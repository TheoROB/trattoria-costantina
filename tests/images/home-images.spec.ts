import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const small = ['salle', 'table', 'bar', 'treille', 'livre']

test('hero and every existing image asset remain byte-identical to the audit base', () => {
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', 'f8d9ea1', '--',
    'public/images', 'assets/hero-table-dressee.jpg', 'components/sections/Hero.tsx'], { encoding: 'utf8' })
    .trim().split('\n').filter((file) => file !== 'public/images/manifest.json')
  for (const file of files) {
    expect(readFileSync(file).equals(execFileSync('git', ['show', `f8d9ea1:${file}`], { maxBuffer: 10 * 1024 * 1024 })), file).toBe(true)
  }
})

test('cold network selects small thumbnails, defers famille and keeps lightbox on demand', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile'
  const images: string[] = []
  page.on('request', (r) => { if (r.resourceType() === 'image') images.push(new URL(r.url()).pathname) })
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const hero = page.locator('#hero img')
  await expect(hero).toHaveAttribute('loading', 'eager')
  await expect(hero).toHaveAttribute('fetchpriority', 'high')
  expect(await hero.evaluate((i: HTMLImageElement) => i.currentSrc)).toContain(mobile ? '/hero-portrait/1280.avif' : '/hero/1920.avif')
  expect(images.some((url) => /\/famille(?:-portrait)?\//.test(url))).toBe(false)
  expect(images.some((url) => url.includes('/galerie-'))).toBe(false)
  const section = page.locator('.section-famille')
  expect(await section.evaluate((e) => e.getBoundingClientRect().height)).toBe(mobile ? 480 : 560)
  await section.scrollIntoViewIfNeeded()
  const famille = page.locator('.famille-bg img')
  await expect(famille).toHaveAttribute('loading', 'lazy')
  await expect.poll(() => images.some((url) => /\/famille(?:-portrait)?\//.test(url))).toBe(true)
  await expect.poll(() => famille.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
  expect(await section.evaluate((e) => e.getBoundingClientRect().height)).toBe(mobile ? 480 : 560)
  await page.locator('.trouver-photos').scrollIntoViewIfNeeded()
  for (const key of small) {
    const image = page.locator(`.gallery-thumb img[src*="galerie-${key}/"]`)
    await expect.poll(() => image.evaluate((i: HTMLImageElement) => i.currentSrc)).toContain(`/galerie-${key}/${mobile ? 240 : 160}.avif`)
    await expect(image).toHaveAttribute('loading', 'lazy')
    expect(images.some((url) => url === `/images/galerie-${key}/1280.avif`)).toBe(false)
  }
  for (const key of ['facade', 'terrasse']) {
    const image = page.locator(`.gallery-thumb img[src*="galerie-${key}/"]`)
    await expect.poll(() => image.evaluate((i: HTMLImageElement) => i.currentSrc)).toContain(`/galerie-${key}/${mobile ? 1280 : 400}.avif`)
  }
  const thumbnail = page.locator('.gallery-thumb').nth(2)
  await thumbnail.click()
  const lightbox = page.locator('.gallery-dialog img')
  await expect(lightbox).toHaveAttribute('loading', 'eager')
  await expect.poll(() => lightbox.evaluate((i: HTMLImageElement) => i.currentSrc)).toContain(`/galerie-salle/${mobile ? 1280 : 800}.avif`)
  await expect.poll(() => lightbox.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.locator('.gallery-dialog')).not.toBeVisible()
})

test('famille loads without IntersectionObserver', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => { delete (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver })
  await page.goto('/')
  await expect(page.locator('.famille-bg > picture img')).toHaveAttribute('loading', 'lazy')
  await page.locator('.section-famille').scrollIntoViewIfNeeded()
  await expect.poll(() => page.locator('.famille-bg > picture img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
  expect(errors).toEqual([])
})

test('server-rendered hero and famille work with JavaScript disabled', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ ...testInfo.project.use, javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:3187/')
  await expect(page.locator('#hero img')).toHaveAttribute('fetchpriority', 'high')
  await expect.poll(() => page.locator('#hero img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
  await page.locator('.section-famille').scrollIntoViewIfNeeded()
  const image = page.locator('.famille-bg noscript img')
  await expect(image).toHaveAttribute('loading', 'lazy')
  await expect(image).toHaveAttribute('alt', /Salle du restaurant/)
  await expect.poll(() => image.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
  await context.close()
})
