import { expect, test, type Page } from '@playwright/test'

/**
 * Lab A: GPU Monte Carlo. The floor every lab route shares is in lab.spec.ts;
 * this checks the claim the figure makes. It goes live where WebGL2 with float
 * targets exists (headless Chromium runs it on SwiftShader) or keeps its
 * poster; the readouts are numbers; the live estimate lands within a few
 * standard errors of Black–Scholes; and the inputs move the closed form.
 */

const ROUTE = '/lab/a'

// A real GPU where the machine has one (ANGLE/Metal on a Mac). Without one
// Chromium falls back to SwiftShader, where the figure keeps its poster by
// design, and the live test checks that instead.
test.use({ launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] } })

const num = async (page: Page, sel: string, attr: string) => Number((await page.locator(sel).first().getAttribute(attr)) ?? NaN)
const canvasShown = (page: Page) =>
  page.locator('canvas').evaluate((c) => getComputedStyle(c).visibility !== 'hidden' && Number(getComputedStyle(c).opacity) > 0.5)

test('the poster arrives first and carries real numbers', async ({ page }) => {
  // Read straight from the server's HTML: no script has run.
  const html = await (await page.request.get(ROUTE)).text()
  expect(html).toContain('data-lab-poster')
  expect(html.match(/<path d="M/g)?.length ?? 0).toBeGreaterThan(50)
  await page.goto(ROUTE)
  const bs = await num(page, '[data-bs-price]', 'data-bs-price')
  // S=100, K=100, T=1, r=3%, σ=25%.
  expect(bs).toBeCloseTo(11.3485, 3)
  await expect(page.locator('[data-mc-price]')).toContainText('±')
})

test('goes live on the GPU where it can, and the estimate converges to Black–Scholes', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto(ROUTE)
  const live = await expect
    .poll(() => canvasShown(page), { timeout: 20_000 })
    .toBe(true)
    .then(() => true)
    .catch(() => false)
  if (!live) {
    // No GPU here (or a software rasteriser): the poster is the figure, and it says why.
    await expect(page.locator('[data-lab-poster]')).toBeVisible()
    await expect(page.getByText(/^Still frame/)).toBeVisible()
    return
  }
  await expect(page.locator('[data-speed]')).toHaveAttribute('data-speed', 'gpu')
  // Enough paths for the estimate to mean something, then within 4 SE.
  await expect.poll(() => num(page, '[data-paths]', 'data-paths'), { timeout: 60_000 }).toBeGreaterThanOrEqual(262_144)
  const mc = await num(page, '[data-mc-price]', 'data-mc-price')
  const se = await num(page, '[data-mc-price]', 'data-mc-se')
  const bs = await num(page, '[data-bs-price]', 'data-bs-price')
  expect(se).toBeGreaterThan(0)
  expect(Math.abs(mc - bs)).toBeLessThan(4 * se)
  await expect(page.locator('[data-speed]')).toContainText('paths/s')
})

test('the volatility and strike inputs move the Black–Scholes price', async ({ page }) => {
  await page.goto(ROUTE)
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
  const bs2 = await num(page, '[data-bs-price]', 'data-bs-price')
  expect(bs2).toBeLessThan(bs1)
})

test('reduced motion: the inputs reprice the still frame on the CPU', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(ROUTE)
  const vol = page.getByRole('slider', { name: /Volatility/ })
  await vol.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-speed]')).toHaveAttribute('data-speed', 'cpu', { timeout: 15_000 })
  expect(await num(page, '[data-paths]', 'data-paths')).toBe(65_536)
  const mc = await num(page, '[data-mc-price]', 'data-mc-price')
  const se = await num(page, '[data-mc-price]', 'data-mc-se')
  const bs = await num(page, '[data-bs-price]', 'data-bs-price')
  expect(Math.abs(mc - bs)).toBeLessThan(4 * se)
  expect(await canvasShown(page)).toBe(false)
})
