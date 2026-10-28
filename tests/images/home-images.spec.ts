import { expect, test, type Page } from '@playwright/test'

const small = ['salle', 'table', 'bar', 'treille', 'livre']

async function expectFamilleGeometry(page: Page, mobile: boolean, loaded = true) {
  const section = page.locator('.section-famille')
  await expect(section.locator('.famille-overlay')).toHaveCount(1)
  const geometry = await section.evaluate((section, loaded) => {
    const rect = (element: Element) => {
      const { x, y, width, height } = element.getBoundingClientRect()
      return { x, y, width, height }
    }
    const overlay = section.querySelector('.famille-overlay')!
    return {
      section: rect(section),
      background: rect(section.querySelector('.famille-bg')!),
      overlay: rect(overlay),
      overlayColor: getComputedStyle(overlay).backgroundColor,
      image: loaded ? rect(section.querySelector('img')!) : null,
    }
  }, loaded)
  expect(geometry.section.height).toBeCloseTo(mobile ? 480 : 560, 1)
  expect(geometry.section.width).toBeCloseTo(mobile ? 390 : 1440, 1)
  for (const rectangle of [geometry.background, geometry.overlay, ...(geometry.image ? [geometry.image] : [])]) {
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(rectangle[key], `${key}: background, overlay and image cover the section`).toBeCloseTo(geometry.section[key], 1)
    }
  }
  expect(geometry.overlayColor).toBe('rgba(20, 10, 4, 0.5)')
}

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
  await expectFamilleGeometry(page, mobile, false)
  const section = page.locator('.section-famille')
  expect(await section.evaluate((e) => e.getBoundingClientRect().height)).toBe(mobile ? 480 : 560)
  await section.scrollIntoViewIfNeeded()
  const famille = page.locator('.famille-bg img')
  await expect(famille).toHaveAttribute('loading', 'lazy')
  await expect.poll(() => images.some((url) => /\/famille(?:-portrait)?\//.test(url))).toBe(true)
  await expect.poll(() => famille.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
  expect(await section.evaluate((e) => e.getBoundingClientRect().height)).toBe(mobile ? 480 : 560)
  await expectFamilleGeometry(page, mobile)
  await page.locator('.trouver-photos').scrollIntoViewIfNeeded()
  for (const key of small) {
    const image = page.locator(`.gallery-thumb img[src*="galerie-${key}/"]`)
    await expect.poll(() => image.evaluate((i: HTMLImageElement) => i.currentSrc)).toContain(`/galerie-${key}/${mobile ? 240 : 160}.avif`)
    await expect(image).toHaveAttribute('loading', 'lazy')
    await expect(image).toHaveAttribute('src', `/images/galerie-${key}/800.webp`)
    expect(images.some((url) => url === `/images/galerie-${key}/1280.avif`)).toBe(false)
  }
  for (const key of ['facade', 'terrasse']) {
    const image = page.locator(`.gallery-thumb img[src*="galerie-${key}/"]`)
    await expect.poll(() => image.evaluate((i: HTMLImageElement) => i.currentSrc)).toContain(`/galerie-${key}/${mobile ? 1280 : 400}.avif`)
  }
  const galleryBounds = await page.locator('.trouver-photos').evaluate((gallery) => {
    const bounds = gallery.getBoundingClientRect()
    return {
      overflow: gallery.scrollWidth - gallery.clientWidth,
      documentOverflow: document.documentElement.scrollWidth - innerWidth,
      outside: [...gallery.querySelectorAll('li')].some((item) => {
        const rect = item.getBoundingClientRect()
        return rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.right > innerWidth + 1
      }),
    }
  })
  expect(galleryBounds.overflow).toBeLessThanOrEqual(1)
  expect(galleryBounds.documentOverflow).toBeLessThanOrEqual(1)
  expect(galleryBounds.outside).toBe(false)
  const thumbnail = page.locator('.gallery-thumb').nth(2)
  await thumbnail.click()
  const lightbox = page.locator('.gallery-dialog img')
  await expect(lightbox).toHaveAttribute('loading', 'eager')
  await expect.poll(() => lightbox.evaluate((i: HTMLImageElement) => i.currentSrc)).toContain(`/galerie-salle/${mobile ? 1280 : 800}.avif`)
  await expect.poll(() => lightbox.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
  await expect(lightbox).toHaveAttribute('src', '/images/galerie-salle/800.webp')
  // Simulate a client ignoring picture/srcset, after verifying modern selection.
  await lightbox.evaluate((image) => {
    image.parentElement!.querySelectorAll('source').forEach((source) => source.remove())
    image.removeAttribute('srcset')
  })
  await expect.poll(() => lightbox.evaluate((i: HTMLImageElement) => i.currentSrc)).toContain('/galerie-salle/800.webp')
  await expect.poll(() => lightbox.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.locator('.gallery-dialog')).not.toBeVisible()
})

test('famille loads without IntersectionObserver', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => { delete (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver })
  await page.goto('/')
  await expect(page.locator('.famille-bg > picture img')).toHaveAttribute('loading', 'lazy')
  await page.locator('.section-famille').scrollIntoViewIfNeeded()
  await expect.poll(() => page.locator('.famille-bg > picture img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
  await expectFamilleGeometry(page, testInfo.project.name === 'mobile')
  expect(errors).toEqual([])
})

test('server-rendered hero and famille work with JavaScript disabled', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ ...testInfo.project.use, javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.locator('#hero img')).toHaveAttribute('fetchpriority', 'high')
  await expect.poll(() => page.locator('#hero img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
  await page.locator('.section-famille').scrollIntoViewIfNeeded()
  const image = page.locator('.famille-bg noscript img')
  await expect(image).toHaveAttribute('loading', 'lazy')
  await expect(image).toHaveAttribute('alt', /Salle du restaurant/)
  await expect.poll(() => image.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
  await expectFamilleGeometry(page, testInfo.project.name === 'mobile')
  await context.close()
})
