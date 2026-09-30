import { expect, test } from '@playwright/test'
import { MODEL, bsCall } from '../../lib/futures/mc'
import { GPU, STAGE, canvasShown, contrast, darkest, errorsOf, fillOpacity, goLive, holdRenderer, inkTones, luminance, num, patch, seen, seq } from './hero-kit'

/**
 * Fig. 1 on the home page: a million simulated futures, priced on the GPU.
 *
 * It must say it is simulated where it is drawn; arrive as a real poster
 * with real numbers before any script runs; go live where the GPU allows
 * (ANGLE/Metal on a Mac; headless Chromium without one falls back to
 * SwiftShader, where the figure keeps its poster by design and says why);
 * land within a few standard errors of Black–Scholes; play its signature
 * sequence once per visit, finished by a click but not by a scroll, then swing
 * into depth and keep moving there (hero-motion.spec.ts: Pause, the pointer,
 * the tilt); fly through on request; and survive what a real visitor does to a
 * live figure — a theme switch, a turn of the device, a lost GPU context, a
 * failed download, the back button, a finger that starts a scroll on it.
 */

test.use({ launchOptions: { args: GPU } })

test('says it is simulated where it is drawn', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#fig-futures')).toContainText(/Simulated\s· geometric Brownian motion\s.*\snot market data/)
})

test.describe('before any script runs', () => {
  test.use({ javaScriptEnabled: false })
  test('the poster is the finished picture, with the formula’s price', async ({ page }) => {
    await page.goto('/')
    expect(await page.locator('[data-futures-poster] path').count()).toBeGreaterThan(50)
    expect(await page.locator('[data-futures-poster] rect').count()).toBeGreaterThan(10)
    // The model's own inputs: S 100, K 100, a year, r 3%, and the simulated market's volatility.
    expect(await num(page, '[data-bs-price]', 'data-bs-price')).toBeCloseTo(bsCall(MODEL.s0, MODEL.strike, MODEL.T, MODEL.r, MODEL.sigma), 3)
    await expect(page.locator('[data-futures-poster]')).toContainText(/Call price.*: \$\d+\.\d\d/)
  })
})

test('its volatility is the simulated market’s: this browser builds the same market and gets the server’s number', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await expect(page.locator('#fig-futures')).toContainText('the simulated market’s realised vol')
  await expect(page.locator('#fig-futures')).toContainText('The volatility starts at the simulated market’s own')
  await expect(page.locator('[data-one-market] a[href="/market"]')).toHaveText('These futures, its order book and its vol surface: one simulated market, running in your browser.')
  const box = page.locator('[data-sigma-server]')
  expect(Number(await box.getAttribute('data-sigma-server'))).toBe(MODEL.sigma)
  if (!(await goLive(page))) test.skip(true, 'no GPU here: the figure keeps its still frame, and the browser does not run the market')
  await expect(box).toHaveAttribute('data-sigma-browser', String(MODEL.sigma), { timeout: 20_000 })
})

test('goes live on the GPU where it can, and the estimate converges to Black–Scholes', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  if (!(await goLive(page))) {
    // Where it cannot go live (software WebGL, as on CI), it keeps a still frame and says why.
    await expect(page.getByText(/^Still frame/).first()).toBeVisible()
    return
  }
  await expect(page.locator('[data-speed]').first()).toHaveAttribute('data-speed', 'gpu')
  await expect.poll(() => num(page, '[data-paths]', 'data-paths'), { timeout: 60_000 }).toBeGreaterThanOrEqual(262_144)
  const mc = await num(page, '[data-mc-price]', 'data-mc-price')
  const se = await num(page, '[data-mc-price]', 'data-mc-se')
  const bs = await num(page, '[data-bs-price]', 'data-bs-price')
  expect(se).toBeGreaterThan(0)
  expect(Math.abs(mc - bs)).toBeLessThan(4 * se)
})

/** The volatility slider's starting place, in its own units: the simulated market's volatility, as a whole percent. */
const VOL0 = Math.round(MODEL.sigma * 100)

test('the volatility and strike inputs move the Black–Scholes price, and Reset returns them', async ({ page }) => {
  await page.goto('/')
  const vol = page.getByRole('slider', { name: 'Volatility' })
  const strike = page.getByRole('slider', { name: 'Strike' })
  const bs0 = await num(page, '[data-bs-price]', 'data-bs-price')
  await vol.focus()
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
  await expect(vol).toHaveValue(String(VOL0 + 5))
  const bs1 = await num(page, '[data-bs-price]', 'data-bs-price')
  expect(bs1).toBeGreaterThan(bs0)
  await strike.focus()
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight')
  await expect(strike).toHaveValue('110')
  expect(await num(page, '[data-bs-price]', 'data-bs-price')).toBeLessThan(bs1)
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(vol).toHaveValue(String(VOL0))
  await expect(strike).toHaveValue('100')
  await expect(page.getByRole('button', { name: 'Reset' })).toHaveCount(0)
})

test('printed while live after the strike moved, the sheet prints the reader\u2019s own call price', async ({ page }) => {
  await seen(page)
  await page.goto('/')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  const strike = page.getByRole('slider', { name: 'Strike' })
  await strike.focus()
  for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowRight')
  await expect(strike).toHaveValue('115')
  const bs = await num(page, '[data-bs-price]', 'data-bs-price')
  // The browser's print: the page is told, then laid out for paper, where the poster stands in for the canvas.
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')))
  await page.emulateMedia({ media: 'print' })
  const label = page.locator(`${STAGE} [data-futures-poster]`).getByText(/^Call price/).first()
  const printed = Number(/\$(\d+\.\d\d)/.exec((await label.textContent()) ?? '')![1])
  // The poster's own Monte Carlo price at K = 115 (65,536 paths), not the default's $10.55.
  expect(Math.abs(printed - bs)).toBeLessThan(0.5)
})

test('reduced motion: a still frame, repriced on the CPU, no flight, and no empty row kept for one', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.dataset.futuresSeq)).toBeUndefined()
  expect(await page.locator('[data-futures-controls]').evaluate((e) => e.getBoundingClientRect().height)).toBe(0)
  // The still frame: the resting view in depth, drawn once, in place of the flat poster.
  const still = page.locator(`${STAGE} [data-still-canvas]`)
  await expect.poll(() => still.evaluate((c) => Number(getComputedStyle(c).opacity)), { timeout: 10_000 }).toBe(1)
  await expect(still).toHaveAttribute('data-drawn', '1')
  const vol = page.getByRole('slider', { name: 'Volatility' })
  await vol.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-speed]').first()).toHaveAttribute('data-speed', 'cpu', { timeout: 15_000 })
  // Repriced, it is drawn again, for the new inputs.
  await expect(still).toHaveAttribute('data-drawn', '2', { timeout: 10_000 })
  expect(await num(page, '[data-paths]', 'data-paths')).toBe(65_536)
  const mc = await num(page, '[data-mc-price]', 'data-mc-price')
  const se = await num(page, '[data-mc-price]', 'data-mc-se')
  expect(Math.abs(mc - (await num(page, '[data-bs-price]', 'data-bs-price')))).toBeLessThan(4 * se)
  expect(await canvasShown(page)).toBe(false)
  await expect(page.getByRole('button', { name: 'Fly through' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Replay' })).toHaveCount(0)
})

test.describe('the signature sequence', () => {
  test.setTimeout(60_000)

  test('plays once per visit, in under 4.5 seconds, and a reload in the same visit does not replay it', async ({ page }) => {
    await page.goto('/')
    if (!(await goLive(page))) return test.skip(true, 'no GPU here: the sequence never plays on a still frame')
    await expect.poll(() => seq(page), { timeout: 15_000, intervals: [50] }).toBe('playing')
    const t0 = Date.now()
    await expect.poll(() => seq(page), { timeout: 10_000, intervals: [50] }).toBe('done')
    expect(Date.now() - t0).toBeLessThan(4_500)
    expect(await page.evaluate(() => sessionStorage.getItem('futures-seq'))).toBe('1')
    await page.reload()
    expect(await page.evaluate(() => document.documentElement.dataset.futuresSeq)).toBeUndefined()
    await expect(page.locator(STAGE)).toHaveAttribute('data-seq', 'off')
  })

  test('a click finishes it at once; a scroll does not', async ({ page }) => {
    await page.goto('/')
    if (!(await goLive(page))) return test.skip(true, 'no GPU here')
    await expect.poll(() => seq(page), { timeout: 15_000, intervals: [50] }).toBe('playing')
    await page.mouse.wheel(0, 40)
    await page.keyboard.press('PageDown')
    // Longer than a skip takes (240 ms): had the scroll counted, it would be over.
    await page.waitForTimeout(400)
    expect(await seq(page)).toBe('playing')
    await page.locator(STAGE).scrollIntoViewIfNeeded()
    // Clicking the figure's own title keeps the stage on screen: off screen it
    // pauses by design, and a click that scrolled it away would wait with it.
    await page.locator('#fig-futures-title').click()
    await expect.poll(() => seq(page), { timeout: 1_000 }).toBe('done')
  })

  test('a key pressed before its first frame does not spend it', async ({ page }) => {
    const chunk = await holdRenderer(page)
    await page.goto('/', { waitUntil: 'load' })
    chunk.armed()
    await page.locator(STAGE).scrollIntoViewIfNeeded()
    await chunk.requested
    await page.keyboard.press('Tab')
    await page.locator('h1').click()
    chunk.release()
    if (!(await goLive(page))) return test.skip(true, 'no GPU here')
    await expect.poll(() => seq(page), { timeout: 15_000, intervals: [50] }).toBe('playing')
    const t0 = Date.now()
    await expect.poll(() => seq(page), { timeout: 10_000, intervals: [50] }).toBe('done')
    expect(Date.now() - t0).toBeGreaterThan(2_500)
  })

  test('a mouse resting on the figure while it plays neither skips it nor sets a strike', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a mouse')
    await page.goto('/')
    if (!(await goLive(page))) return test.skip(true, 'no GPU here')
    await expect.poll(() => seq(page), { timeout: 15_000, intervals: [50] }).toBe('playing')
    const b = (await page.locator(STAGE).boundingBox())!
    await page.mouse.move(b.x + b.width * 0.9, b.y + b.height * 0.3)
    await page.waitForTimeout(700)
    await expect(page.getByRole('slider', { name: 'Strike' })).toHaveValue('100')
    await expect.poll(() => seq(page), { timeout: 6_000 }).toBe('done')
    await expect(page.getByRole('slider', { name: 'Strike' })).toHaveValue('100')
  })

  test('at rest it keeps moving: the stream and the drift draw new frames', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto('/')
    if (!(await goLive(page))) return test.skip(true, 'no GPU here')
    await expect.poll(() => seq(page), { timeout: 15_000 }).toBe('done')
    await expect(page.locator(`${STAGE} [data-camera]`)).toHaveAttribute('data-camera', 'rest', { timeout: 6_000 })
    const draws = async () => Number(await page.locator(`${STAGE} [data-draws]`).getAttribute('data-draws'))
    const before = await draws()
    await page.waitForTimeout(1500)
    expect((await draws()) - before).toBeGreaterThan(20)
  })
})



test('Fly through flies, and Stop or Escape brings it home', async ({ page }) => {
  test.setTimeout(60_000)
  await seen(page)
  await page.goto('/')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await page.getByRole('button', { name: 'Fly through' }).click()
  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(page.getByRole('button', { name: 'Fly through' })).toBeVisible()
  await page.getByRole('button', { name: 'Fly through' }).click()
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Fly through' })).toBeVisible()
})

test('at rest, a click on the price scale sets the strike to the price printed there', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a mouse')
  test.setTimeout(60_000)
  await seen(page)
  await page.goto('/')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await expect(page.locator(`${STAGE} [data-camera]`)).toHaveAttribute('data-camera', 'rest', { timeout: 8_000 })
  // Held still, so the scale stays where it was read.
  await page.locator('#fig-futures').getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(600)
  const tick = page.locator(`${STAGE} [data-camera] span`, { hasText: /^\$150$/ })
  const b = (await tick.boundingBox())!
  // The tick's own point is just right of its label, on the wall's front edge.
  await page.mouse.click(b.x + b.width + 6, b.y + b.height / 2)
  const k = Number(await page.getByRole('slider', { name: 'Strike' }).inputValue())
  expect(Math.abs(k - 150)).toBeLessThanOrEqual(2)
})

test('a click away from the wall, on today, sets no strike and keeps the price the figure claims', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a mouse')
  test.setTimeout(60_000)
  await seen(page)
  await page.goto('/')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await expect(page.locator(`${STAGE} [data-camera]`)).toHaveAttribute('data-camera', 'rest', { timeout: 8_000 })
  await page.locator('#fig-futures').getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(600)
  const today = page.locator(`${STAGE} [data-camera] span`, { hasText: /^Today/ })
  const b = (await today.boundingBox())!
  const before = await page.getByRole('slider', { name: 'Strike' }).inputValue()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
  expect(await page.getByRole('slider', { name: 'Strike' }).inputValue()).toBe(before)
  await expect(page.locator(STAGE)).not.toContainText('Call at $')
})

test('a finger that starts a scroll on the figure sets nothing', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch')
  await seen(page)
  await page.goto('/')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  const b = (await page.locator(STAGE).boundingBox())!
  const at = { clientX: b.x + b.width * 0.8, clientY: b.y + b.height * 0.25, pointerId: 7, pointerType: 'touch', isPrimary: true }
  await page.locator(STAGE).dispatchEvent('pointerdown', at)
  await page.locator(STAGE).dispatchEvent('pointercancel', at)
  await page.waitForTimeout(300)
  await expect(page.getByRole('slider', { name: 'Strike' })).toHaveValue('100')
})

test('the screen-reader table follows the live figure', async ({ page }) => {
  test.setTimeout(60_000)
  await seen(page)
  await page.goto('/')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  const caption = page.locator('#fig-futures table caption')
  const row = page.locator('#fig-futures table tbody tr').nth(3)
  await expect(caption).toContainText(`at ${VOL0}% volatility`)
  const before = await row.textContent()
  const vol = page.getByRole('slider', { name: 'Volatility' })
  await vol.focus()
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight')
  await expect(vol).toHaveValue(String(VOL0 + 20))
  await expect(caption).toContainText(`at ${VOL0 + 20}% volatility`, { timeout: 5_000 })
  // Its rows are the new run's, not the old distribution under a new caption.
  expect(await row.textContent()).not.toBe(before)
})

test('by day the paying paths are ink on paper, at least 3:1 against it', async ({ page }) => {
  test.setTimeout(60_000)
  await seen(page)
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await expect(page.locator('[data-paths]').first()).not.toHaveAttribute('data-paths', '0', { timeout: 15_000 })
  await expect(page.locator(`${STAGE} [data-camera]`)).toHaveAttribute('data-camera', 'rest', { timeout: 6_000 })
  await page.locator('#fig-futures').getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(400)
  // The densest futures, wherever the camera has put them: the darkest patch on the fan's side of the stage, away from
  // the bars on the wall.
  const pays = await darkest(page, { x0: 0, y0: 0.1, x1: 0.6, y1: 0.9 })
  const paper = await patch(page, { x0: 0.02, y0: 0.02, x1: 0.08, y1: 0.08 })
  expect(contrast(pays, paper)).toBeGreaterThanOrEqual(3)
})

test('by day the core of the futures is a deep indigo, not ink-black: the bundle keeps a tone to read into', async ({ browser, isMobile }) => {
  test.skip(isMobile, 'measured once, at a laptop’s and a phone’s own pixel density')
  test.setTimeout(90_000)
  for (const opts of [
    { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
    { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  ]) {
    const ctx = await browser.newContext({ ...opts, colorScheme: 'light' })
    const page = await ctx.newPage()
    await seen(page)
    await page.goto('/')
    if (!(await goLive(page))) return test.skip(true, 'no GPU here')
    await expect(page.locator(`${STAGE} [data-camera]`)).toHaveAttribute('data-camera', 'rest', { timeout: 8_000 })
    await page.locator('#fig-futures').getByRole('button', { name: 'Pause' }).click()
    await page.waitForTimeout(1_000)
    // The left half: today and the body of the fan, clear of the wall and its bars.
    const t = await inkTones(page, 0.5)
    await ctx.close()
    expect(t.n).toBeGreaterThan(1000)
    // Saturated, the darkest twentieth of the fan's ink sat at 0.044–0.048, the floor the ink tends to; it stays well
    // above it now.
    expect(t.p05, `${opts.viewport.width}px`).toBeGreaterThan(0.07)
  }
})

test('stays live, in the new palette, through a theme switch and a turn of the device', async ({ page }) => {
  const errors = errorsOf(page)
  await seen(page)
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await page.waitForTimeout(500)
  const light = luminance(await patch(page))
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForTimeout(500)
  expect(await canvasShown(page)).toBe(true)
  const dark = luminance(await patch(page))
  expect(dark).toBeLessThan(light - 0.3)
  const vp = page.viewportSize()!
  await page.setViewportSize({ width: vp.height, height: vp.width })
  await page.waitForTimeout(400)
  expect(await canvasShown(page)).toBe(true)
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(sw).toBeLessThanOrEqual(cw)
  expect(errors).toEqual([])
})

test('reduced motion turned on and off again while the page is open: still, then live again, without an error', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await seen(page)
  await page.goto('/')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => canvasShown(page), { timeout: 5_000 }).toBe(false)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(() => canvasShown(page), { timeout: 10_000 }).toBe(true)
  const draws = () => num(page, `${STAGE} [data-draws]`, 'data-draws')
  const n = await draws()
  await expect.poll(draws, { timeout: 5_000 }).toBeGreaterThan(n + 5)
  expect(errors).toEqual([])
})

test('a lost GPU context puts the finished poster back, without errors', async ({ page }) => {
  const errors = errorsOf(page)
  await page.goto('/')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await page.locator(`${STAGE} [data-live-canvas]`).evaluate((c) => (c as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext())
  await expect.poll(() => canvasShown(page), { timeout: 5_000 }).toBe(false)
  expect(await page.evaluate(() => document.documentElement.dataset.futuresSeq)).toBeUndefined()
  await expect.poll(() => fillOpacity(page), { timeout: 2_000 }).toBe(1)
  await expect(page.getByText('Still frame: the graphics context was lost.')).toBeVisible()
  expect(errors).toEqual([])
})

test('a lost context that the browser restores (as iOS does after an app switch) brings the live figure back', async ({ page }) => {
  const errors = errorsOf(page)
  await seen(page)
  await page.goto('/')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await page.locator(`${STAGE} [data-live-canvas]`).evaluate((c) => {
    const ext = (c as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context')
    ;(window as unknown as { __restore: () => void }).__restore = () => ext?.restoreContext()
    ext?.loseContext()
  })
  await expect.poll(() => canvasShown(page), { timeout: 5_000 }).toBe(false)
  await expect(page.getByText('Still frame: the graphics context was lost.')).toBeVisible()
  await page.evaluate(() => (window as unknown as { __restore: () => void }).__restore())
  await expect.poll(() => canvasShown(page), { timeout: 10_000 }).toBe(true)
  await expect(page.getByText('Still frame: the graphics context was lost.')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('a context lost before the first frame still leaves the finished poster', async ({ page }) => {
  const chunk = await holdRenderer(page)
  await page.goto('/', { waitUntil: 'load' })
  chunk.armed()
  await page.locator(STAGE).scrollIntoViewIfNeeded()
  await chunk.requested
  await page.locator(`${STAGE} [data-live-canvas]`).evaluate((c) => (c as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext())
  chunk.release()
  await expect.poll(() => fillOpacity(page), { timeout: 3_000 }).toBe(1)
  expect(await page.evaluate(() => document.documentElement.dataset.futuresSeq)).toBeUndefined()
})

test('a renderer that fails to download leaves the finished poster, and says so', async ({ page }) => {
  let loaded = false
  await page.route('**/_next/static/chunks/*.js', (route) => (loaded ? route.abort() : route.continue()))
  await page.goto('/', { waitUntil: 'load' })
  loaded = true
  await page.locator(STAGE).scrollIntoViewIfNeeded()
  await expect.poll(() => fillOpacity(page), { timeout: 10_000 }).toBeGreaterThan(0.99)
  expect(await canvasShown(page)).toBe(false)
  // Where WebGL is drawn in software (CI) the figure declines before it loads a renderer, and says that instead.
  if (await page.getByText('Still frame: this browser draws WebGL in software.').isVisible()) return test.skip(true, 'software WebGL: no renderer is fetched')
  await expect(page.getByText('Still frame: the live figure could not start here.')).toBeVisible()
})

test('the stage is big: about 576px tall on a laptop, most of a phone screen and its full width', async ({ page, isMobile }) => {
  await page.goto('/')
  const b = (await page.locator(STAGE).boundingBox())!
  const vp = page.viewportSize()!
  if (isMobile) {
    expect(b.width).toBe(vp.width)
    expect(b.height).toBeGreaterThanOrEqual(0.66 * vp.height)
  } else {
    expect(b.height).toBeGreaterThanOrEqual(560)
    expect(b.height).toBeLessThanOrEqual(600)
  }
})

test('on a laptop the sequence starts on the first screen, without a scroll', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a phone reader scrolls to the figure')
  // A 13-inch laptop's window: its screen, less the browser's bars and the Dock.
  for (const [width, height] of [[1440, 789], [1280, 720], [1440, 900]] as const) {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    await page.evaluate(() => sessionStorage.removeItem('futures-seq'))
    await page.reload()
    if (!(await page.evaluate(() => document.documentElement.dataset.futuresSeq === '1'))) return test.skip(true, 'no sequence on this machine')
    await expect.poll(() => seq(page), { timeout: 20_000, intervals: [100] }).toMatch(/^(playing|done|off)$/)
    // Software WebGL (CI) keeps the still frame, so no sequence plays there.
    if ((await seq(page)) === 'off' && (await page.getByText(/^Still frame/).first().isVisible())) return test.skip(true, 'no GPU here')
    expect(await seq(page)).toMatch(/^(playing|done)$/)
  }
})

test('a stage only partly in view plays after a moment, and its margin claims no paths while it waits', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a laptop window')
  test.setTimeout(60_000)
  // A short window: a quarter of the stage shows.
  await page.setViewportSize({ width: 1440, height: 610 })
  await page.goto('/')
  if (!(await page.evaluate(() => document.documentElement.dataset.futuresSeq === '1'))) return test.skip(true, 'no sequence on this machine')
  // Live where it stands: no scroll into view.
  const live = await expect.poll(() => canvasShown(page), { timeout: 20_000 }).toBe(true).then(() => true, () => false)
  if (!live) return test.skip(true, 'no GPU here')
  const waiting: number[] = []
  for (let i = 0; i < 25 && (await seq(page)) === 'pending'; i++) {
    waiting.push(await num(page, '[data-paths]', 'data-paths'))
    await page.waitForTimeout(100)
  }
  expect(waiting.filter((n) => n !== 0)).toEqual([])
  await expect.poll(() => seq(page), { timeout: 4_000 }).toMatch(/^(playing|done)$/)
})
