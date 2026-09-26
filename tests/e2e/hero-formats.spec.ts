import { expect, test, type Page } from '@playwright/test'
import { GPU, STAGE, errorsOf, goLive, luminance, num, patch, seen } from './hero-kit'

/**
 * The live figure on the paths a phone takes. iPhone Safari offers no 32-bit
 * float render target and no float blending (EXT_color_buffer_float,
 * EXT_float_blend), which is where the first version declined. Pricing now
 * keeps its floats as bits in integer targets and needs neither; the density
 * the paths add up to is half float where the device has it, eight-bit where
 * it has nothing. Chromium is made to lack the extensions the way a phone
 * does, and each path must go live, price correctly, count its histogram
 * exactly, and look like the full one.
 */

test.use({ launchOptions: { args: GPU } })

/** Take extensions away from the page, as a browser without them would. `asHalf` answers EXT_color_buffer_half_float with the float one, which is how a phone's half-float support is simulated here. */
async function lack(page: Page, names: string[], asHalf = false) {
  await page.addInitScript(
    ({ names, asHalf }) => {
      const P = WebGL2RenderingContext.prototype
      const get = P.getExtension
      const list = P.getSupportedExtensions
      P.getExtension = function (this: WebGL2RenderingContext, n: string) {
        if (asHalf && n === 'EXT_color_buffer_half_float') return get.call(this, 'EXT_color_buffer_float')
        return names.includes(n) ? null : get.call(this, n)
      } as typeof P.getExtension
      P.getSupportedExtensions = function (this: WebGL2RenderingContext) {
        const all = (list.call(this) ?? []).filter((n) => !names.includes(n))
        return asHalf && !all.includes('EXT_color_buffer_half_float') ? [...all, 'EXT_color_buffer_half_float'] : all
      }
    },
    { names, asHalf },
  )
}

const density = (page: Page) => page.locator(`${STAGE} [data-density]`).getAttribute('data-density')

async function converges(page: Page) {
  await expect.poll(() => num(page, '[data-paths]', 'data-paths'), { timeout: 60_000 }).toBeGreaterThanOrEqual(262_144)
  const mc = await num(page, '[data-mc-price]', 'data-mc-price')
  const se = await num(page, '[data-mc-price]', 'data-mc-se')
  const bs = await num(page, '[data-bs-price]', 'data-bs-price')
  expect(se).toBeGreaterThan(0)
  expect(Math.abs(mc - bs)).toBeLessThan(4 * se)
}

// The standard normal CDF (Abramowitz and Stegun 7.1.26, error under 1.5e-7).
const Phi = (x: number) => {
  const t = 1 / (1 + 0.3275911 * (Math.abs(x) / Math.SQRT2))
  const e = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-(x * x) / 2)
  return x >= 0 ? (1 + e) / 2 : (1 - e) / 2
}

/**
 * The screen-reader table's bands against the lognormal law the model implies
 * (S0 100, r 3%, σ 25%, one year). A lost or doubled count moves a band by far
 * more than its rounding to a tenth of a percent.
 */
async function countsExactly(page: Page) {
  await expect.poll(() => num(page, '[data-paths]', 'data-paths'), { timeout: 60_000 }).toBeGreaterThanOrEqual(16_777_216)
  // The table follows the live run once a second.
  await page.waitForTimeout(1_200)
  const rows = await page.locator('#fig-futures table tbody tr').evaluateAll((trs) =>
    trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent ?? '')),
  )
  const mu = Math.log(100) + (0.03 - 0.5 * 0.25 * 0.25), sd = 0.25
  let total = 0
  for (const [range, share] of rows) {
    const [lo, hi] = range!.replace(/\$/g, '').split('–').map(Number) as [number, number]
    const want = Phi((Math.log(hi) - mu) / sd) - Phi((Math.log(lo) - mu) / sd)
    const got = Number(share!.replace('%', '')) / 100
    total += got
    expect(Math.abs(got - want)).toBeLessThan(0.0015)
  }
  expect(total).toBeGreaterThan(0.995)
}

test('without float render targets or float blending, as on an iPhone, it goes live on half float and prices right', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = errorsOf(page)
  await lack(page, ['EXT_color_buffer_float', 'EXT_float_blend'], true)
  await seen(page)
  await page.goto('/')
  expect(await goLive(page)).toBe(true)
  expect(await density(page)).toBe('rgba16f')
  await converges(page)
  await countsExactly(page)
  expect(errors).toEqual([])
})

test('with no half float either, it goes live on eight bits and prices right', async ({ page }) => {
  test.setTimeout(120_000)
  const errors = errorsOf(page)
  await lack(page, ['EXT_color_buffer_float', 'EXT_float_blend', 'EXT_color_buffer_half_float'])
  await seen(page)
  await page.goto('/')
  expect(await goLive(page)).toBe(true)
  expect(await density(page)).toBe('rgba8')
  await converges(page)
  await countsExactly(page)
  expect(errors).toEqual([])
})

test('the eight-bit path draws the same picture as half float', async ({ browser }) => {
  test.setTimeout(90_000)
  const shot = async (url: string, scheme: 'light' | 'dark') => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme })
    const page = await ctx.newPage()
    const errors = errorsOf(page)
    await seen(page)
    // Paused from the first frame: the figure holds the composed frame with every path whole, the same picture both times.
    await page.addInitScript(() => sessionStorage.setItem('futures-paused', '1'))
    await page.goto(url)
    expect(await goLive(page)).toBe(true)
    await expect(page.locator('[data-paths]').first()).not.toHaveAttribute('data-paths', '0', { timeout: 15_000 })
    await page.waitForTimeout(1_000)
    // The densest paying futures, and the thin fringe below the strike.
    const core = luminance(await patch(page, { x0: 0.25, y0: 0.45, x1: 0.4, y1: 0.55 }))
    const fringe = luminance(await patch(page, { x0: 0.5, y0: 0.62, x1: 0.62, y1: 0.7 }))
    expect(errors).toEqual([])
    await ctx.close()
    return { core, fringe }
  }
  for (const scheme of ['light', 'dark'] as const) {
    const half = await shot('/', scheme)
    const byte = await shot('/?gl=rgba8', scheme)
    expect(Math.abs(half.core - byte.core)).toBeLessThan(0.04)
    expect(Math.abs(half.fringe - byte.fringe)).toBeLessThan(0.04)
  }
})
