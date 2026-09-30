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
/** One thumbnail moves at a time: the entry under the reader's pointer or focus. Focus leaves the thumbnail's border as it is. */
const choose = (page: Page, slug: string) => page.locator(`[data-vt-contents] li:has([data-vt-thumb="fig-${slug}"]) h3 a`).focus()

test('the thumbnails are the build’s pictures until they are on screen, then each comes alive', async ({ page }) => {
  const errors = errorsOf(page)
  await seen(page)
  await page.goto('/')
  // Nothing is loaded for a Contents the reader has not reached.
  await page.waitForTimeout(1_500)
  expect(await page.locator('[data-vt-contents] canvas').count()).toBe(0)
  await page.evaluate(() => document.querySelector('#contents')?.scrollIntoView({ block: 'start' }))
  // The one nearest the screen's middle comes alive first, with no pointer or focus.
  await expect(page.locator('[data-vt-contents] canvas[data-shown]')).toHaveCount(1, { timeout: 10_000 })
  await choose(page, 'market')
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
  await choose(page, 'closebooks')
  // The canvas over the build's picture, shown, while the batch holds its first frame (nine seconds); then the same
  // box with the canvas stepped out of the way, the SVG alone.
  await expect(t.locator('canvas[data-shown]')).toHaveCount(1, { timeout: 10_000 })
  const after = await t.screenshot()
  await t.locator('canvas').evaluate((c) => {
    ;(c as HTMLCanvasElement).style.transition = 'none'
    ;(c as HTMLCanvasElement).style.opacity = '0'
  })
  const before = await t.screenshot()
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
  // The same picture, drawn by the canvas instead of the SVG, on the same device pixels: only the edges differ, each
  // rasteriser smoothing them its own way (measured 5.4 of 255 on average at 1×, and about 5 at a phone's 2.625); the
  // canvas resampled off the device's pixel grid measured 8.6 to 9.5.
  expect(diff).toBeLessThan(8)
})

test('draws at most thirty frames a second, and stops when scrolled away', async ({ page }) => {
  await seen(page)
  await toContents(page)
  await choose(page, 'market')
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

test('on a phone the thumbnails show at the column’s width, and come alive too', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'a phone')
  await seen(page)
  await toContents(page)
  const t = thumb(page, 'market')
  await expect(t).toBeVisible()
  await choose(page, 'market')
  await expect(t.locator('canvas[data-shown]')).toHaveCount(1, { timeout: 10_000 })
})

test.describe('through the morph', () => {
  test('opening /market from its miniature carries its market on: the paper opens where the miniature was', async ({ page }) => {
    test.setTimeout(60_000)
    await seen(page)
    await page.addInitScript(() => sessionStorage.setItem('market-seq', '1'))
    await toContents(page)
    await choose(page, 'market')
    const cv = thumb(page, 'market').locator('canvas[data-shown]')
    await expect(cv).toHaveCount(1, { timeout: 10_000 })
    await page.waitForTimeout(3_000)
    const mini = Number(await cv.getAttribute('data-t'))
    expect(mini).toBeGreaterThan(145)
    // The mark as the page first paints, whatever the figure then decides.
    await page.addInitScript(() =>
      document.addEventListener('DOMContentLoaded', () => ((window as unknown as { __handoff?: string }).__handoff = document.documentElement.dataset.marketHandoff)),
    )
    await page.locator('[data-vt-contents] h3 a[href="/market"]').click()
    await page.waitForURL('**/market')
    // The paper's still frames and numbers are at its own moment: they wait for the handed one.
    expect(await page.evaluate(() => (window as unknown as { __handoff?: string }).__handoff)).toBe('1')
    await page.evaluate(() => document.querySelector('[data-market-stage]')?.scrollIntoView({ block: 'start' }))
    const live = await expect(page.locator('[data-market-stage]'))
      .toHaveAttribute('data-market-live', '1', { timeout: 20_000 })
      .then(() => true)
      .catch(() => false)
    if (!live) return test.skip(true, 'no GPU here')
    expect(Number(await page.locator('[data-market-stage]').getAttribute('data-market-t'))).toBeGreaterThanOrEqual(mini)
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.marketHandoff ?? null)).toBeNull()
  })
})

test('Pause holds every thumbnail where it is, for the rest of the visit, and Resume lets them go on (WCAG 2.2.2)', async ({ page }) => {
  // The page coming back paused hydrates without a mismatch: the words it was sent are the words it first renders.
  const errors = errorsOf(page)
  await seen(page)
  await toContents(page)
  await choose(page, 'market')
  await expect(thumb(page, 'market').locator('canvas[data-shown]')).toHaveCount(1, { timeout: 10_000 })
  const pause = page.locator('[data-contents-pause]')
  await expect(pause).toBeVisible()
  await pause.click()
  await expect(pause).toHaveText('Resume thumbnails')
  const a = await frames(page, 'market')
  await page.waitForTimeout(1_000)
  expect(await frames(page, 'market')).toBe(a)
  await page.reload()
  await page.evaluate(() => document.querySelector('#contents')?.scrollIntoView({ block: 'start' }))
  await expect(pause).toHaveText('Resume thumbnails', { timeout: 10_000 })
  await pause.click()
  await choose(page, 'market')
  await expect(thumb(page, 'market').locator('canvas[data-shown]')).toHaveCount(1, { timeout: 10_000 })
  const b = await frames(page, 'market')
  await page.waitForTimeout(1_000)
  expect(await frames(page, 'market')).toBeGreaterThan(b + 10)
  expect(errors).toEqual([])
})

test('one thumbnail moves at a time: the one the reader is at; the others hold their frame', async ({ page, isMobile }) => {
  test.skip(isMobile, 'four on screen at a laptop’s size')
  await seen(page)
  await toContents(page)
  await choose(page, 'market')
  await expect(thumb(page, 'market').locator('canvas[data-shown]')).toHaveCount(1, { timeout: 10_000 })
  await choose(page, 'cricstate')
  await expect(thumb(page, 'cricstate').locator('canvas[data-shown]')).toHaveCount(1, { timeout: 10_000 })
  const held = await frames(page, 'market')
  await page.waitForTimeout(800)
  expect(await frames(page, 'market')).toBe(held)
  expect(await frames(page, 'cricstate')).toBeGreaterThan(10)
})

test('pointing at an entry’s title marks its thumbnail, and pointing at the thumbnail marks the title', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a pointer')
  await seen(page)
  await toContents(page)
  const li = page.locator('[data-vt-contents] li').filter({ has: page.locator('[data-vt-thumb="fig-cricstate"]') })
  const border = () => li.locator('[data-vt-thumb]').evaluate((e) => getComputedStyle(e).borderTopColor)
  const deco = () => li.locator('h3 a').evaluate((e) => getComputedStyle(e).textDecorationColor)
  const [b0, d0] = [await border(), await deco()]
  await li.locator('h3 a').hover()
  await expect.poll(border).not.toBe(b0)
  await li.locator('[data-vt-thumb]').hover()
  await expect.poll(deco).not.toBe(d0)
})
