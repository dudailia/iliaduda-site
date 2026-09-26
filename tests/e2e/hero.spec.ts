import { expect, test } from '@playwright/test'
import { GPU, STAGE, canvasShown, contrast, errorsOf, fillOpacity, goLive, holdRenderer, luminance, num, patch, seen, seq } from './hero-kit'

/**
 * Fig. 1 on the home page: a million simulated futures, priced on the GPU.
 *
 * It must say it is simulated where it is drawn; arrive as a real poster
 * with real numbers before any script runs; go live where the GPU allows
 * (ANGLE/Metal on a Mac; headless Chromium without one falls back to
 * SwiftShader, where the figure keeps its poster by design and says why);
 * land within a few standard errors of Black–Scholes; play its signature
 * sequence once per visit, finished by a click but not by a scroll, then fall
 * still; fly through on request; and survive what a real visitor does to a
 * live figure — a theme switch, a turn of the device, a lost GPU context, a
 * failed download, the back button, a finger that starts a scroll on it.
 */

test.use({ launchOptions: { args: GPU } })

test('says it is simulated where it is drawn', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#fig-futures')).toContainText(/Simulated · geometric Brownian motion .* not market data/)
})

test.describe('before any script runs', () => {
  test.use({ javaScriptEnabled: false })
  test('the poster is the finished picture, with the formula’s price', async ({ page }) => {
    await page.goto('/')
    expect(await page.locator('[data-futures-poster] path').count()).toBeGreaterThan(50)
    expect(await page.locator('[data-futures-poster] rect').count()).toBeGreaterThan(10)
    // S = 100, K = 100, T = 1, r = 3%, σ = 25%.
    expect(await num(page, '[data-bs-price]', 'data-bs-price')).toBeCloseTo(11.3485, 3)
    await expect(page.locator('[data-futures-poster]')).toContainText(/Call price.*: \$\d+\.\d\d/)
  })
})

test('goes live on the GPU where it can, and the estimate converges to Black–Scholes', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  if (!(await goLive(page))) {
    await expect(page.locator('[data-futures-poster]')).toBeVisible()
    await expect(page.getByText(/^Still frame/)).toBeVisible()
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

test('the volatility and strike inputs move the Black–Scholes price, and Reset returns them', async ({ page }) => {
  await page.goto('/')
  const vol = page.getByRole('slider', { name: 'Volatility' })
  const strike = page.getByRole('slider', { name: 'Strike' })
  const bs0 = await num(page, '[data-bs-price]', 'data-bs-price')
  await vol.focus()
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
  await expect(vol).toHaveValue('30')
  const bs1 = await num(page, '[data-bs-price]', 'data-bs-price')
  expect(bs1).toBeGreaterThan(bs0)
  await strike.focus()
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight')
  await expect(strike).toHaveValue('110')
  expect(await num(page, '[data-bs-price]', 'data-bs-price')).toBeLessThan(bs1)
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(vol).toHaveValue('25')
  await expect(strike).toHaveValue('100')
  await expect(page.getByRole('button', { name: 'Reset' })).toHaveCount(0)
})

test('reduced motion: a still frame, repriced on the CPU, no flight, and no empty row kept for one', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.dataset.futuresSeq)).toBeUndefined()
  expect(await page.locator('[data-futures-controls]').evaluate((e) => e.getBoundingClientRect().height)).toBe(0)
  const vol = page.getByRole('slider', { name: 'Volatility' })
  await vol.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-speed]').first()).toHaveAttribute('data-speed', 'cpu', { timeout: 15_000 })
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

  test('falls still when it is over: no frame is drawn while nothing changes', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto('/')
    if (!(await goLive(page))) return test.skip(true, 'no GPU here')
    await expect.poll(() => seq(page), { timeout: 15_000 }).toBe('done')
    await expect(page.locator('[data-paths]').first()).toHaveAttribute('data-paths', String(2 ** 28), { timeout: 60_000 })
    await page.waitForTimeout(500)
    const draws = async () => Number(await page.locator(`${STAGE} [data-draws]`).getAttribute('data-draws'))
    const before = await draws()
    await page.waitForTimeout(1500)
    // A figure drawing every frame would add about 90 here. One or two are the
    // frame-rate governor stepping quality, which redraws once at the new resolution.
    expect((await draws()) - before).toBeLessThanOrEqual(2)
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
  await expect(caption).toContainText('at 25% volatility')
  const before = await row.textContent()
  const vol = page.getByRole('slider', { name: 'Volatility' })
  await vol.focus()
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight')
  await expect(vol).toHaveValue('45')
  await expect(caption).toContainText('at 45% volatility', { timeout: 5_000 })
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
  await page.waitForTimeout(800)
  // Just above the strike, half-way to expiry: the densest paying futures.
  const pays = await patch(page, { x0: 0.3, y0: 0.5, x1: 0.42, y1: 0.56 })
  const paper = await patch(page, { x0: 0.02, y0: 0.02, x1: 0.08, y1: 0.08 })
  expect(contrast(pays, paper)).toBeGreaterThanOrEqual(3)
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

test('a lost GPU context puts the finished poster back, without errors', async ({ page }) => {
  const errors = errorsOf(page)
  await page.goto('/')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await page.locator(`${STAGE} canvas`).evaluate((c) => (c as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext())
  await expect.poll(() => canvasShown(page), { timeout: 5_000 }).toBe(false)
  expect(await page.evaluate(() => document.documentElement.dataset.futuresSeq)).toBeUndefined()
  await expect.poll(() => fillOpacity(page), { timeout: 2_000 }).toBe(1)
  await expect(page.getByText('Still frame: the graphics context was lost.')).toBeVisible()
  expect(errors).toEqual([])
})

test('a context lost before the first frame still leaves the finished poster', async ({ page }) => {
  const chunk = await holdRenderer(page)
  await page.goto('/', { waitUntil: 'load' })
  chunk.armed()
  await page.locator(STAGE).scrollIntoViewIfNeeded()
  await chunk.requested
  await page.locator(`${STAGE} canvas`).evaluate((c) => (c as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext())
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
  await expect.poll(() => fillOpacity(page), { timeout: 10_000 }).toBe(1)
  expect(await canvasShown(page)).toBe(false)
  await expect(page.getByText('Still frame: the live figure could not start here.')).toBeVisible()
})
