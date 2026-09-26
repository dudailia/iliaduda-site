import { expect, test, type Page } from '@playwright/test'

/**
 * Fig. 1 on the home page: a million simulated futures, priced on the GPU.
 *
 * It must say it is simulated where it is drawn; arrive as a real poster
 * with real numbers before any script runs; go live where the GPU allows
 * (ANGLE/Metal on a Mac; headless Chromium without one falls back to
 * SwiftShader, where the figure keeps its poster by design and says why);
 * land within a few standard errors of Black–Scholes; play its signature
 * sequence once per visit, finish it on a click or key but not on a scroll;
 * fly through on request; and survive the things a real visitor does to a
 * live figure: a theme switch, a resize, a lost GPU context, the back button.
 */

test.use({ launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] } })

const STAGE = '[data-seq]'
const num = async (page: Page, sel: string, attr: string) => Number((await page.locator(sel).first().getAttribute(attr)) ?? NaN)
const canvasShown = (page: Page) =>
  page.locator(`${STAGE} canvas`).evaluate((c) => getComputedStyle(c).visibility !== 'hidden' && Number(getComputedStyle(c).opacity) > 0.5)
const seq = (page: Page) => page.locator(STAGE).getAttribute('data-seq')
const errorsOf = (page: Page) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}
/** Bring the stage fully into view and wait for it to go live; false where this machine has no usable GPU. */
async function goLive(page: Page) {
  await page.locator(STAGE).scrollIntoViewIfNeeded()
  return expect
    .poll(() => canvasShown(page), { timeout: 20_000 })
    .toBe(true)
    .then(() => true)
    .catch(() => false)
}

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
    await expect(page.locator('[data-futures-poster]')).toContainText(/Average, discounted to today: \$\d+\.\d\d/)
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

test('the volatility and strike inputs move the Black–Scholes price', async ({ page }) => {
  await page.goto('/')
  const vol = page.getByRole('slider', { name: /Volatility/ })
  const strike = page.getByRole('slider', { name: /Strike/ })
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
})

test('reduced motion: a still frame, repriced on the CPU, and no flight', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.dataset.futuresSeq)).toBeUndefined()
  const vol = page.getByRole('slider', { name: /Volatility/ })
  await vol.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-speed]').first()).toHaveAttribute('data-speed', 'cpu', { timeout: 15_000 })
  expect(await num(page, '[data-paths]', 'data-paths')).toBe(65_536)
  const mc = await num(page, '[data-mc-price]', 'data-mc-price')
  const se = await num(page, '[data-mc-price]', 'data-mc-se')
  expect(Math.abs(mc - (await num(page, '[data-bs-price]', 'data-bs-price')))).toBeLessThan(4 * se)
  expect(await canvasShown(page)).toBe(false)
  await expect(page.getByRole('button', { name: 'Fly through' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Replay' })).toBeHidden()
})

test.describe('the signature sequence', () => {
  test.setTimeout(60_000)

  test('plays once per visit, and a reload in the same visit does not replay it', async ({ page }) => {
    await page.goto('/')
    expect(await page.evaluate(() => document.documentElement.dataset.futuresSeq)).toBe('1')
    if (!(await goLive(page))) return test.skip(true, 'no GPU here: the sequence never plays on a still frame')
    await expect.poll(() => seq(page), { timeout: 15_000 }).toBe('done')
    expect(await page.evaluate(() => sessionStorage.getItem('futures-seq'))).toBe('1')
    await page.reload()
    expect(await page.evaluate(() => document.documentElement.dataset.futuresSeq)).toBeUndefined()
    await expect(page.locator(STAGE)).toHaveAttribute('data-seq', 'off')
  })

  test('a click finishes it at once; a scroll does not', async ({ page }) => {
    await page.goto('/')
    if (!(await goLive(page))) return test.skip(true, 'no GPU here')
    await expect.poll(() => seq(page), { timeout: 15_000 }).toBe('playing')
    await page.mouse.wheel(0, 40)
    await page.waitForTimeout(150)
    expect(await seq(page)).toBe('playing')
    // Clicking the figure's own title keeps the stage on screen: off screen it
    // pauses by design, and a click that scrolled it away would wait with it.
    await page.locator('#fig-futures-title').click()
    await expect.poll(() => seq(page), { timeout: 1_000 }).toBe('done')
  })

  test('a return through the back button does not replay it', async ({ page }) => {
    await page.goto('/')
    if (!(await goLive(page))) return test.skip(true, 'no GPU here')
    await expect.poll(() => seq(page), { timeout: 15_000 }).toBe('done')
    await page.goto('/about')
    await page.goBack()
    await expect(page.locator(STAGE)).not.toHaveAttribute('data-seq', /pending|playing/)
  })
})

test('Fly through flies, and Stop or Escape brings it home', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  const fly = page.getByRole('button', { name: 'Fly through' })
  await fly.click()
  const stop = page.getByRole('button', { name: 'Stop' })
  await expect(stop).toHaveAttribute('aria-pressed', 'true')
  await stop.click()
  await expect(page.getByRole('button', { name: 'Fly through' })).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: 'Fly through' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Fly through' })).toBeVisible()
})

test('stays live and quiet through a theme switch and a turn of the device', async ({ page }) => {
  const errors = errorsOf(page)
  await page.goto('/')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForTimeout(300)
  expect(await canvasShown(page)).toBe(true)
  // Turning the device: the stage resizes and redraws in the same task.
  const vp = page.viewportSize()!
  await page.setViewportSize({ width: vp.height, height: vp.width })
  await page.waitForTimeout(300)
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
  await expect(page.locator('[data-futures-poster]')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.dataset.futuresSeq)).toBeUndefined()
  // The finished picture fades back in: no futures hidden behind the pre-paint mark.
  await expect.poll(async () => Number(await page.locator('[data-futures-poster] [data-fill]').first().evaluate((e) => getComputedStyle(e).opacity)), { timeout: 2_000 }).toBe(1)
  expect(errors).toEqual([])
})
