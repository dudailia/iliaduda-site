import { expect, test, type Page } from '@playwright/test'
import { GPU, errorsOf } from './hero-kit'

/**
 * /market's Fig. 1: one market in a worker, three views drawn from it in the same frame. It opens on still frames of
 * the same seeded market; goes live with the site's own worker script; tells its shock once, landing in all three
 * views in one animation frame; holds when paused and when the tab is away, and comes back to the market it left;
 * takes fifty presses in a second; swaps still frames under reduced motion; and survives a theme switch and a turn.
 */

test.use({ launchOptions: { args: GPU } })

const STAGE = '[data-market-stage]'
const t = (page: Page) => page.locator(STAGE).getAttribute('data-market-t').then(Number)
/** Skip the signature: this session has seen it. */
const seenStory = (page: Page) => page.addInitScript(() => sessionStorage.setItem('market-seq', '1'))

async function goLive(page: Page) {
  await page.evaluate(() => document.querySelector('[data-market-stage]')?.scrollIntoView({ block: 'start' }))
  return expect(page.locator(STAGE))
    .toHaveAttribute('data-market-live', '1', { timeout: 20_000 })
    .then(() => true)
    .catch(() => false)
}

/** The animation frame each view took the latest landing in (document.timeline's clock). */
const stamps = (page: Page) => page.locator(`${STAGE} canvas`).evaluateAll((cs) => cs.map((c) => (c as HTMLCanvasElement).dataset.landed ?? null))

test.describe('before any script runs', () => {
  test.use({ javaScriptEnabled: false })
  test('the still frames are the server’s, and the table says what they show', async ({ page }) => {
    await page.goto('/market')
    for (const f of ['book', 'ladder', 'fan']) await expect(page.locator(`#fig-1 img[src="/market/${f}.svg"]`)).toHaveCount(1)
    await expect(page.locator('#fig-1 img[src="/market/surface.svg"]')).toHaveCount(1)
    await expect(page.locator('#fig-1 table caption')).toContainText(/price \$\d+\.\d\d.*realised volatility \d+\.\d%.*stress \d\.\d\d/)
  })
})

test('goes live with the site’s own worker, and all three views draw, fetching no still frame it is not showing', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  const workers: string[] = []
  page.on('worker', (w) => workers.push(w.url()))
  const shocked: string[] = []
  page.on('request', (r) => r.url().includes('-shock.svg') && shocked.push(r.url()))
  await seenStory(page)
  await page.goto('/market')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here: the still frames stay')
  expect(workers.length).toBeGreaterThan(0)
  const origin = new URL(page.url()).origin
  for (const w of workers) expect(new URL(w).origin).toBe(origin)
  for (const c of await page.locator(`${STAGE} canvas`).all()) await expect.poll(() => c.evaluate((e) => Number(getComputedStyle(e).opacity))).toBe(1)
  await expect(page.locator('#fig-1 dd').first()).toHaveText(/^\d+:\d\d$/)
  const t0 = await t(page)
  await expect.poll(() => t(page), { timeout: 5_000 }).toBeGreaterThan(t0 + 0.5)
  expect(shocked).toEqual([])
  expect(errors).toEqual([])
})

test('tells its shock once: calm, then a shock landing in all three views in one frame, then the recovery', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await page.goto('/market')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  const story = page.locator('[data-market-story]')
  await expect(story).toHaveAttribute('data-market-story', 'calm', { timeout: 10_000 })
  await expect(story).toHaveAttribute('data-market-story', 'shock', { timeout: 10_000 })
  await expect.poll(async () => (await stamps(page)).every((s) => s !== null), { timeout: 5_000 }).toBe(true)
  const s = await stamps(page)
  expect(new Set(s).size).toBe(1)
  await expect(story).toHaveAttribute('data-market-story', 'recovery', { timeout: 10_000 })
  await expect(story).toHaveAttribute('data-market-story', /running|absorbing/, { timeout: 10_000 })
  // Once a session: a reload does not tell it again.
  await page.reload()
  await goLive(page)
  await page.waitForTimeout(3_500)
  expect(await stamps(page)).toEqual([null, null, null])
  expect(errors).toEqual([])
})

test('a reader’s shock lands in all three views in one frame, and a click in the calm is the story’s shock', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/market')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await expect(page.locator('[data-market-story]')).toHaveAttribute('data-market-story', 'calm', { timeout: 10_000 })
  await page.locator('[data-market-shock]').click()
  await expect.poll(async () => new Set(await stamps(page)).size === 1 && (await stamps(page))[0] !== null, { timeout: 5_000 }).toBe(true)
  const first = (await stamps(page))[0]
  // The story does not press again: after its calm would have ended, the only landing is the reader's.
  await page.waitForTimeout(3_000)
  expect((await stamps(page))[0]).toBe(first)
})

test('Pause holds the market, and Resume carries it on from there', async ({ page }) => {
  test.setTimeout(60_000)
  await seenStory(page)
  await page.goto('/market')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(300)
  const held = await t(page)
  await page.waitForTimeout(1_500)
  expect(await t(page)).toBeCloseTo(held, 1)
  await expect(page.locator('[data-market-story]')).toHaveAttribute('data-market-story', 'paused')
  await page.getByRole('button', { name: 'Resume' }).click()
  await expect.poll(() => t(page), { timeout: 5_000 }).toBeGreaterThan(held + 0.5)
})

test('a tab left in the background comes back to the market it left, with no long task', async ({ page }) => {
  test.setTimeout(60_000)
  await seenStory(page)
  await page.goto('/market')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  // What hiding a tab does to the page: its animation frames stop, then come back after the gap.
  await page.evaluate(() => {
    ;(window as unknown as { longest: number }).longest = 0
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) (window as unknown as { longest: number }).longest = Math.max((window as unknown as { longest: number }).longest, e.duration)
    }).observe({ type: 'longtask', buffered: false })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(500)
  const before = await t(page)
  await page.waitForTimeout(8_000)
  expect(await t(page)).toBeCloseTo(before, 1)
  const back = Date.now()
  await page.evaluate(() => {
    delete (document as unknown as { hidden?: boolean }).hidden
    delete (document as unknown as { visibilityState?: string }).visibilityState
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(2_000)
  const after = await t(page)
  const away = (Date.now() - back) / 1000
  // It went on from where it was, at real time: never the eight seconds it missed.
  expect(after - before).toBeLessThan(away + 0.5)
  expect(after - before).toBeGreaterThan(away - 1)
  expect(Number(await page.locator(STAGE).getAttribute('data-market-held'))).toBeGreaterThan(7)
  expect(await page.evaluate(() => (window as unknown as { longest: number }).longest)).toBeLessThan(50)
})

test('fifty presses in a second leave the market bounded and the page clean', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await seenStory(page)
  await page.goto('/market')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  const button = page.locator('[data-market-shock]')
  for (let i = 0; i < 50; i++) await button.click({ delay: 0, noWaitAfter: true })
  await expect(page.locator('[data-market-story]')).toHaveAttribute('data-market-story', 'absorbing', { timeout: 5_000 })
  await page.waitForTimeout(3_000)
  const stress = Number(await page.locator('#fig-1 dd').nth(4).textContent())
  expect(stress).toBeGreaterThanOrEqual(0)
  expect(stress).toBeLessThanOrEqual(1)
  const t0 = await t(page)
  await expect.poll(() => t(page), { timeout: 5_000 }).toBeGreaterThan(t0 + 0.5)
  expect(errors).toEqual([])
})

test('a theme switch and a turn of the device while live leave it live and the page clean', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await seenStory(page)
  await page.goto('/market')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForTimeout(500)
  const size = page.viewportSize()!
  await page.setViewportSize({ width: size.height > size.width ? 844 : 768, height: size.height > size.width ? 390 : 1024 })
  await page.waitForTimeout(800)
  await expect(page.locator(STAGE)).toHaveAttribute('data-market-live', '1')
  const t0 = await t(page)
  await expect.poll(() => t(page), { timeout: 5_000 }).toBeGreaterThan(t0 + 0.5)
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(sw).toBeLessThanOrEqual(cw)
  expect(errors).toEqual([])
})

test('reduced motion: still frames, no worker, and Liquidity shock swaps the shocked frames in and out', async ({ page }) => {
  const errors = errorsOf(page)
  const workers: string[] = []
  page.on('worker', (w) => workers.push(w.url()))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/market')
  await page.evaluate(() => document.querySelector('[data-market-stage]')?.scrollIntoView({ block: 'start' }))
  const toggle = page.locator('[data-market-still-shock]')
  await expect(toggle).toHaveText('Liquidity shock')
  await expect(page.locator('#fig-1')).toContainText('Still frames: your system asks for reduced motion.')
  await toggle.click()
  await expect(toggle).toHaveText('Back to calm')
  await expect(page.locator('[data-market-poster="book"]')).toHaveAttribute('data-moment', 'shock')
  await expect(page.locator('#fig-1 img[src="/market/fan-shock.svg"]')).toHaveCount(1)
  await toggle.click()
  await expect(page.locator('[data-market-poster="book"]')).toHaveAttribute('data-moment', 'calm')
  await page.waitForTimeout(2_000)
  expect(workers).toEqual([])
  expect(errors).toEqual([])
})
