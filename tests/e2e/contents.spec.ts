import { expect, test, type Page } from '@playwright/test'
import { GPU, errorsOf } from './hero-kit'

/**
 * The Contents' live miniatures (components/thumbs/): each thumbnail is the build's picture first, comes alive once half
 * of it is on screen, draws its first frame as that picture, draws at most thirty frames a second, stops when it leaves
 * the screen, and under reduced motion never starts.
 */

test.use({ launchOptions: { args: GPU } })

/** The home figure's story, seen: the Contents is what these tests look at. */
const seen = (page: Page) => page.addInitScript(() => sessionStorage.setItem('futures-seq', '1'))
const thumb = (page: Page, slug: string) => page.locator(`[data-vt-contents] [data-vt-thumb="fig-${slug}"]`)
const frames = (page: Page, slug: string) =>
  thumb(page, slug)
    .locator('canvas')
    .evaluate((c) => Number((c as HTMLCanvasElement).dataset.frames ?? 0))
    .catch(() => 0)

async function toContents(page: Page) {
  await page.goto('/')
  await page.evaluate(() => document.querySelector('#contents')?.scrollIntoView({ block: 'start' }))
}

test('the thumbnails are the build’s pictures until they are on screen, then each comes alive', async ({ page }) => {
  const errors = errorsOf(page)
  await seen(page)
  await page.goto('/')
  // Nothing is loaded for a Contents the reader has not reached.
  await page.waitForTimeout(1_500)
  expect(await page.locator('[data-vt-contents] canvas').count()).toBe(0)
  await page.evaluate(() => document.querySelector('#contents')?.scrollIntoView({ block: 'start' }))
  const first = thumb(page, 'market')
  await expect(first.locator('canvas[data-shown]')).toHaveCount(1, { timeout: 10_000 })
  await expect(first.locator('svg')).toBeVisible()
  expect(errors).toEqual([])
})

test('a miniature’s first frame is its thumbnail', async ({ page }) => {
  await seen(page)
  await toContents(page)
  const t = thumb(page, 'closebooks')
  await t.scrollIntoViewIfNeeded()
  // The build's picture, then the canvas over it the moment it shows (the batch holds for its first four seconds).
  const before = await t.screenshot()
  await expect(t.locator('canvas[data-shown]')).toHaveCount(1, { timeout: 10_000 })
  await page.waitForTimeout(250)
  const after = await t.screenshot()
  const diff = await page.evaluate(
    async ([a, b]) => {
      const load = (s: string) =>
        new Promise<ImageData>((res) => {
          const im = new Image()
          im.onload = () => {
            const c = document.createElement('canvas')
            c.width = im.width
            c.height = im.height
            const g = c.getContext('2d')!
            g.drawImage(im, 0, 0)
            res(g.getImageData(0, 0, c.width, c.height))
          }
          im.src = `data:image/png;base64,${s}`
        })
      const [x, y] = await Promise.all([load(a!), load(b!)])
      let sum = 0
      for (let i = 0; i < x.data.length; i += 4) sum += Math.abs(x.data[i]! - y.data[i]!) + Math.abs(x.data[i + 1]! - y.data[i + 1]!) + Math.abs(x.data[i + 2]! - y.data[i + 2]!)
      return sum / (x.data.length / 4) / 3
    },
    [before.toString('base64'), after.toString('base64')],
  )
  // The same picture, drawn by the canvas instead of the SVG: a mean difference per channel under 3 of 255 at a whole
  // device-pixel ratio, and under 8 at a phone's fractional one (2.625), where the two smooth their edges differently.
  const dpr = await page.evaluate(() => devicePixelRatio)
  expect(diff).toBeLessThan(Number.isInteger(dpr) ? 3 : 8)
})

test('draws at most thirty frames a second, and stops when scrolled away', async ({ page }) => {
  await seen(page)
  await toContents(page)
  await expect(thumb(page, 'market').locator('canvas[data-shown]')).toHaveCount(1, { timeout: 10_000 })
  // Frames a second on the page's own clock: the canvas's count over two seconds.
  const rate = await thumb(page, 'market')
    .locator('canvas')
    .evaluate(
      (c) =>
        new Promise<number>((res) => {
          const n0 = Number((c as HTMLCanvasElement).dataset.frames), t0 = performance.now()
          setTimeout(() => res(((Number((c as HTMLCanvasElement).dataset.frames) - n0) * 1000) / (performance.now() - t0)), 2_000)
        }),
    )
  expect(rate).toBeGreaterThan(10)
  expect(rate).toBeLessThanOrEqual(31)
  await page.evaluate(() => scrollTo(0, 0))
  await page.waitForTimeout(300)
  const c = await frames(page, 'market')
  await page.waitForTimeout(1_000)
  expect(await frames(page, 'market')).toBe(c)
})

test('under reduced motion the thumbnails stay the build’s pictures', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await seen(page)
  await toContents(page)
  await page.waitForTimeout(2_500)
  expect(await page.locator('[data-vt-contents] canvas').count()).toBe(0)
})

test('on a phone the thumbnails show under each abstract, and come alive too', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'a phone')
  await seen(page)
  await toContents(page)
  const t = thumb(page, 'market')
  await expect(t).toBeVisible()
  await expect(t.locator('canvas[data-shown]')).toHaveCount(1, { timeout: 10_000 })
})

test.describe('through the morph', () => {
  test('opening /market from its miniature carries its market on: the paper opens where the miniature was', async ({ page }) => {
    test.setTimeout(60_000)
    await seen(page)
    await page.addInitScript(() => sessionStorage.setItem('market-seq', '1'))
    await toContents(page)
    const cv = thumb(page, 'market').locator('canvas[data-shown]')
    await expect(cv).toHaveCount(1, { timeout: 10_000 })
    await page.waitForTimeout(3_000)
    const mini = Number(await cv.getAttribute('data-t'))
    expect(mini).toBeGreaterThan(145)
    await page.locator('[data-vt-contents] h3 a[href="/market"]').click()
    await page.waitForURL('**/market')
    await page.evaluate(() => document.querySelector('[data-market-stage]')?.scrollIntoView({ block: 'start' }))
    const live = await expect(page.locator('[data-market-stage]'))
      .toHaveAttribute('data-market-live', '1', { timeout: 20_000 })
      .then(() => true)
      .catch(() => false)
    if (!live) return test.skip(true, 'no GPU here')
    expect(Number(await page.locator('[data-market-stage]').getAttribute('data-market-t'))).toBeGreaterThanOrEqual(mini)
  })
})

test('Pause holds every thumbnail where it is, for the rest of the visit, and Resume lets them go on (WCAG 2.2.2)', async ({ page }) => {
  await seen(page)
  await toContents(page)
  await expect(thumb(page, 'market').locator('canvas[data-shown]')).toHaveCount(1, { timeout: 10_000 })
  const pause = page.locator('[data-contents-pause]')
  await expect(pause).toBeVisible()
  await pause.click()
  await expect(pause).toHaveText('Resume')
  const a = await frames(page, 'market')
  await page.waitForTimeout(1_000)
  expect(await frames(page, 'market')).toBe(a)
  await page.reload()
  await page.evaluate(() => document.querySelector('#contents')?.scrollIntoView({ block: 'start' }))
  await expect(pause).toHaveText('Resume', { timeout: 10_000 })
  await pause.click()
  await expect(thumb(page, 'market').locator('canvas[data-shown]')).toHaveCount(1, { timeout: 10_000 })
  const b = await frames(page, 'market')
  await page.waitForTimeout(1_000)
  expect(await frames(page, 'market')).toBeGreaterThan(b + 10)
})
