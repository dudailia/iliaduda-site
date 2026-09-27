import { expect, test, type Page } from '@playwright/test'
import { GPU, errorsOf } from './hero-kit'

/**
 * /order-book, Fig. 1: a synthetic limit order book as terrain, to the hero's
 * standard. A real frame of the market before any script runs; live on the
 * GPU where it can be; the terrain rising out of the page once per visit,
 * finished by a click but not by a scroll; the market at real time on any
 * display; Pause holding everything; a still frame under reduced motion that
 * the keyboard can still read; and the phone's path — iPhone Safari's missing
 * extensions, a lost and restored context — without an error.
 */

test.use({ launchOptions: { args: GPU } })

const STAGE = '#fig-order-book [data-seq]'
const seq = (page: Page) => page.locator(STAGE).getAttribute('data-seq')
const attr = async (page: Page, name: string) => Number((await page.locator(`${STAGE} [data-${name}]`).getAttribute(`data-${name}`, { timeout: 2_000 })) ?? NaN)
const canvasShown = (page: Page) =>
  page.locator(`${STAGE} canvas`).evaluate((c) => getComputedStyle(c).visibility !== 'hidden' && Number(getComputedStyle(c).opacity) > 0.5)
async function goLive(page: Page) {
  await page.locator(STAGE).scrollIntoViewIfNeeded()
  const live = await expect
    .poll(() => canvasShown(page), { timeout: 20_000 })
    .toBe(true)
    .then(() => true, () => false)
  if (live) await page.waitForFunction(() => !document.querySelector('[data-orderbook-controls]')?.getAnimations({ subtree: true }).length)
  return live
}
const seen = (page: Page) => page.addInitScript(() => sessionStorage.setItem('orderbook-seq', '1'))
const panel = (page: Page) => page.locator('[data-stage-debug]')
const row = (page: Page, k: RegExp) =>
  panel(page)
    .locator('div')
    .filter({ has: page.locator('dt', { hasText: k }) })
    .locator('dd')

test.describe('before any script runs', () => {
  test.use({ javaScriptEnabled: false })
  test('the poster is a real frame of the market, with its numbers in the margin', async ({ page }) => {
    await page.goto('/order-book')
    // Whichever arrangement this viewport shows, its poster says what it is with the frame's own numbers, and its
    // labels are drawn in the page, over the image.
    const img = page.locator('#fig-order-book img:visible')
    await expect(img).toHaveCount(1)
    await expect(img).toHaveAttribute('alt', /synthetic order book.*\$\d+\.\d{2}/)
    await expect(page.locator('#fig-order-book svg:visible text').filter({ hasText: /^Price \$/ })).toHaveCount(1)
    await expect(page.locator('#fig-order-book dd').first()).toHaveText(/^\$\d+\.\d{2,3}$/)
  })

  test('fetches one poster, the one its screen shows, and it follows the colour scheme', async ({ page, isMobile }) => {
    const got: string[] = []
    page.on('response', (r) => {
      if (/\/order-book\/poster-/.test(r.url())) got.push(`${r.url().split('/').pop()} ${r.headers()['content-type']}`)
    })
    await page.goto('/order-book')
    await expect(page.locator('#fig-order-book img:visible')).toHaveJSProperty('complete', true)
    expect(got).toEqual([`poster-${isMobile ? 'narrow' : 'wide'}.svg image/svg+xml; charset=utf-8`])
  })

  test('frames the poster as the live figure will: a portrait tablet’s stage is wider than tall, so it is the wide frame', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/order-book')
    const img = page.locator('#fig-order-book img')
    await expect(img).toHaveJSProperty('complete', true)
    expect(await img.evaluate((i) => (i as HTMLImageElement).currentSrc)).toMatch(/poster-wide\.svg$/)
    await expect(page.locator('#fig-order-book svg:visible text').filter({ hasText: /^Price \$/ })).toHaveCount(1)
  })
})

test('goes live, and the terrain rises out of the page once per visit: a reload does not replay it', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await page.goto('/order-book')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await expect.poll(() => seq(page), { timeout: 10_000 }).toBe('playing')
  await expect.poll(() => seq(page), { timeout: 10_000 }).toBe('done')
  await page.reload()
  expect(await goLive(page)).toBe(true)
  await page.waitForTimeout(800)
  expect(await seq(page)).toBe('off')
  expect(errors).toEqual([])
})

test('a click finishes the rise at once; a scroll does not', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a mouse and a wheel')
  test.setTimeout(60_000)
  await page.goto('/order-book')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await expect.poll(() => seq(page), { timeout: 10_000 }).toBe('playing')
  await page.mouse.wheel(0, 40)
  await page.waitForTimeout(150)
  expect(await seq(page)).toBe('playing')
  await page.locator('#fig-order-book figcaption').click()
  await expect.poll(() => seq(page), { timeout: 1_500 }).toBe('done')
})

test('the market runs at real time, on any display', async ({ page }) => {
  test.setTimeout(60_000)
  await seen(page)
  await page.goto('/order-book')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await page.waitForTimeout(500)
  const t0 = await attr(page, 'sim-t'), w0 = Date.now()
  await page.waitForTimeout(3_000)
  const t1 = await attr(page, 'sim-t'), w1 = Date.now()
  // A frame's fraction of a 1/60 s quantum is carried to the next, so the market keeps the wall clock's pace.
  expect((t1 - t0) / ((w1 - w0) / 1000)).toBeGreaterThan(0.85)
  expect((t1 - t0) / ((w1 - w0) / 1000)).toBeLessThan(1.15)
})

test('Pause holds it: nothing is drawn and the market stops; Resume lets it run again', async ({ page }) => {
  test.setTimeout(60_000)
  await seen(page)
  await page.goto('/order-book')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  // Fig. 2 has its own Pause for the same market; this is Fig. 1's.
  await page.locator('#fig-order-book').getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(400)
  const t0 = await attr(page, 'sim-t')
  await page.waitForTimeout(1_200)
  expect(await attr(page, 'sim-t')).toBe(t0)
  await page.locator('#fig-order-book').getByRole('button', { name: 'Resume' }).click()
  await expect.poll(() => attr(page, 'sim-t'), { timeout: 3_000 }).toBeGreaterThan(t0 + 0.5)
})

test('paused, it draws nothing new until the reader points at it, and the probe still answers', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a mouse')
  test.setTimeout(60_000)
  await seen(page)
  await page.goto('/order-book')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await page.locator('#fig-order-book').getByRole('button', { name: 'Pause' }).click()
  // Whatever was still settling (the lean, a label's fade) comes to rest; then nothing is drawn.
  await page.waitForTimeout(1_000)
  const n = await attr(page, 'draws')
  await page.waitForTimeout(1_000)
  expect(await attr(page, 'draws')).toBe(n)
  const box = (await page.locator(`${STAGE} canvas`).boundingBox())!
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.6)
  await expect.poll(() => attr(page, 'draws'), { timeout: 2_000 }).toBeGreaterThan(n)
  await expect(page.locator('#fig-order-book-probe dd').first()).toContainText('$')
})

test('a point pinned by a click is where the arrow keys step from', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a mouse')
  test.setTimeout(60_000)
  await seen(page)
  await page.goto('/order-book')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  // Paused, the price window holds still, so a price is a price from one reading to the next.
  await page.locator('#fig-order-book').getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(800)
  const price = page.locator('#fig-order-book-probe dd').first()
  const usd = async () => Number((await price.textContent())!.replace(/[^0-9.]/g, ''))
  const box = (await page.locator(`${STAGE} canvas`).boundingBox())!
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.6)
  // Off the stage, the hover gives way to the pinned point.
  await page.mouse.move(box.x - 40, box.y - 40)
  await expect(price).toContainText('$')
  const pinned = await usd()
  await page.keyboard.press('ArrowRight')
  await expect.poll(usd).toBeCloseTo(pinned + 0.01, 6)
  // And the click really pinned somewhere of its own, not where the keys start.
  await page.keyboard.press('Home')
  await expect.poll(usd).not.toBeCloseTo(pinned, 6)
})

test('reduced motion: the still frame, no canvas, and the arrow keys still read the book', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/order-book')
  await page.waitForTimeout(800)
  expect(await canvasShown(page)).toBe(false)
  await expect(page.locator('#fig-order-book img:visible')).toHaveCount(1)
  await page.locator(STAGE).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('#fig-order-book-probe dd').first()).toContainText('$')
  await page.keyboard.press('Escape')
  await expect(page.locator('#fig-order-book-probe dd').first()).toContainText('—')
})

test('with iPhone Safari’s float extensions missing, it still goes live, without an error', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await page.addInitScript(() => {
    const P = WebGL2RenderingContext.prototype
    const get = P.getExtension
    const gone = ['EXT_color_buffer_float', 'EXT_float_blend', 'OES_texture_float_linear']
    P.getExtension = function (this: WebGL2RenderingContext, n: string) {
      return gone.includes(n) ? null : get.call(this, n)
    } as typeof P.getExtension
  })
  await seen(page)
  await page.goto('/order-book')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await expect.poll(() => attr(page, 'draws'), { timeout: 5_000 }).toBeGreaterThan(20)
  expect(errors).toEqual([])
})

test('a lost context shows the poster again, and a restored one brings the figure back, without an error', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await seen(page)
  await page.goto('/order-book')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await page.evaluate(() => {
    const c = document.querySelector('#fig-order-book canvas') as HTMLCanvasElement
    const ext = c.getContext('webgl2')!.getExtension('WEBGL_lose_context')!
    ;(window as unknown as { __lose: WEBGL_lose_context }).__lose = ext
    ext.loseContext()
  })
  await expect.poll(() => canvasShown(page), { timeout: 5_000 }).toBe(false)
  await page.evaluate(() => (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext())
  await expect.poll(() => canvasShown(page), { timeout: 10_000 }).toBe(true)
  await expect.poll(() => attr(page, 'draws'), { timeout: 5_000 }).toBeGreaterThan(5)
  expect(errors).toEqual([])
})

test('on a first visit a lost context shows the finished poster, not an empty stage, and the restored figure has one set of labels', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await page.goto('/order-book')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await expect.poll(() => seq(page), { timeout: 10_000 }).toBe('playing')
  await page.evaluate(() => {
    const c = document.querySelector('#fig-order-book canvas') as HTMLCanvasElement
    const ext = c.getContext('webgl2')!.getExtension('WEBGL_lose_context')!
    ;(window as unknown as { __lose: WEBGL_lose_context }).__lose = ext
    ext.loseContext()
  })
  await expect.poll(() => canvasShown(page), { timeout: 5_000 }).toBe(false)
  // The picture itself is there to see: the first-visit mark no longer hides it.
  const fill = page.locator('#fig-order-book [data-orderbook-poster] [data-fill]').first()
  await expect.poll(() => fill.evaluate((e) => Number(getComputedStyle(e).opacity)), { timeout: 2_000 }).toBeGreaterThan(0.9)
  await expect(page.locator('#fig-order-book')).toContainText('Still frame: the graphics context was lost.')
  await page.evaluate(() => (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext())
  await expect.poll(() => canvasShown(page), { timeout: 10_000 }).toBe(true)
  await expect.poll(() => attr(page, 'draws'), { timeout: 5_000 }).toBeGreaterThan(5)
  // One renderer's labels, not two: the lost renderer took its own with it.
  await expect(page.locator(`${STAGE} [data-draws] > span`).filter({ hasText: /^Price / })).toHaveCount(1)
  await expect(page.locator('#fig-order-book')).not.toContainText('Still frame: the graphics context was lost.')
  expect(errors).toEqual([])
})

test('?debug=1 reports the live figure, and whether this browser computes the same market as Node', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await seen(page)
  await page.goto('/order-book?debug=1')
  await expect(panel(page)).toBeVisible()
  // The market twenty seconds after the still frame, computed here, against the fingerprint pinned from Node.
  await expect(row(page, /^market$/)).toHaveText(/^same as Node · \d+:\d+:[\d,]+$/, { timeout: 15_000 })
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await expect(row(page, /^figure$/)).toHaveText('live')
  await expect(row(page, /^tier$/)).toHaveText(/^(high|mid|low) · quality \d · [1-9]\d* fps$/, { timeout: 5_000 })
  await expect(row(page, /^simulated time$/)).toHaveText(/^\d+\.\d s · \d+ events$/)
  expect(errors).toEqual([])
})

test('?debug=1 gives the reason the figure keeps its still frame, and the hint says it too', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/order-book?debug=1')
  await expect(row(page, /^figure$/)).toHaveText('declined: Still frame: your system asks for reduced motion.')
  await expect(page.locator('#fig-order-book p').filter({ hasText: 'Still frame' }).first()).toContainText('arrow keys')
  await expect(row(page, /^market$/)).toHaveText(/^same as Node/, { timeout: 15_000 })
})

test('has no debug panel without the flag', async ({ page }) => {
  await page.goto('/order-book')
  await page.waitForTimeout(500)
  await expect(panel(page)).toHaveCount(0)
})

