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
const stamps = (page: Page) => page.locator(`${STAGE} canvas:not([data-ghost]):not([data-still-sheet])`).evaluateAll((cs) => cs.map((c) => (c as HTMLCanvasElement).dataset.landed ?? null))

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
  for (const c of await page.locator(`${STAGE} canvas:not([data-ghost]):not([data-still-sheet])`).all()) await expect.poll(() => c.evaluate((e) => Number(getComputedStyle(e).opacity))).toBe(1)
  await expect(page.locator('#fig-1 dd').first()).toHaveText(/^\d+:\d\d$/)
  const t0 = await t(page)
  await expect.poll(() => t(page), { timeout: 5_000 }).toBeGreaterThan(t0 + 0.5)
  expect(shocked).toEqual([])
  expect(errors).toEqual([])
})

test('the year’s range is never a range of nothing: the still frame’s stands until the fan is drawn', async ({ page }) => {
  await seenStory(page)
  await page.goto('/market')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  const seen = await page.evaluate(
    () =>
      new Promise<string[]>((res) => {
        const out: string[] = []
        const t0 = performance.now()
        const tick = () => {
          document.querySelectorAll('#fig-1 [data-market-value]').forEach((e) => out.push(e.textContent ?? ''))
          if (performance.now() - t0 < 3000) requestAnimationFrame(tick)
          else res(out)
        }
        tick()
      }),
  )
  expect(seen.filter((v) => v.includes('$0.00'))).toEqual([])
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
  await expect(story).toHaveAttribute('data-market-story', 'recovering', { timeout: 10_000 })
  // Told, the line says the market's own state: still recovering while the stress is up, then running.
  await expect(story).toHaveAttribute('data-market-story', /running|recovering/, { timeout: 10_000 })
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
  // Pressed where it is, without scrolling the stage: on a phone, bringing the button into view takes the surface out.
  await page.locator('[data-market-shock]').evaluate((b) => (b as HTMLButtonElement).click())
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

test('Pause is remembered for the visit: the market opens held on the next page, and Pause during the calm holds the story', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/market')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  const story = page.locator('[data-market-story]')
  await expect(story).toHaveAttribute('data-market-story', 'calm', { timeout: 10_000 })
  // A press of Pause is not a request to hurry: the calm holds, and no shock lands while it does.
  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(story).toHaveAttribute('data-market-story', 'paused')
  await page.waitForTimeout(3_500)
  expect(await stamps(page)).toEqual([null, null, null])
  await page.reload()
  await goLive(page)
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  const held = await t(page)
  await page.waitForTimeout(1_000)
  expect(await t(page)).toBeCloseTo(held, 1)
})

test('Replay starts the market over from its opening moment and tells the story again', async ({ page }) => {
  test.setTimeout(60_000)
  await seenStory(page)
  await page.goto('/market')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await expect.poll(() => t(page), { timeout: 5_000 }).toBeGreaterThan(146)
  await page.locator('[data-replay]').click()
  const story = page.locator('[data-market-story]')
  await expect(story).toHaveAttribute('data-market-story', 'calm', { timeout: 5_000 })
  await expect.poll(() => t(page), { timeout: 2_000 }).toBeLessThan(146)
  await expect(story).toHaveAttribute('data-market-story', 'shock', { timeout: 10_000 })
})

test('Replay on a market that opened held starts it over: the old picture fades, and the book runs again', async ({ page }) => {
  test.setTimeout(60_000)
  await seenStory(page)
  await page.addInitScript(() => sessionStorage.setItem('market-paused', '1'))
  await page.goto('/market')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  await page.waitForTimeout(3_000)
  await page.locator('[data-replay]').click()
  const ghost = page.locator('[data-market-book] canvas[data-ghost]')
  await expect.poll(() => ghost.evaluate((g) => Number(getComputedStyle(g).opacity)), { timeout: 3_000 }).toBe(0)
  const t0 = await t(page)
  await expect.poll(() => t(page), { timeout: 5_000 }).toBeGreaterThan(t0 + 0.5)
})

test('reduced motion turned on and off while the page is open: still frames, then live again', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await seenStory(page)
  await page.goto('/market')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator(STAGE)).toHaveAttribute('data-market-live', '0')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(page.locator(STAGE)).toHaveAttribute('data-market-live', '1', { timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  expect(errors).toEqual([])
})

test('a moment pointed at in the book is the moment every readout shows: one moment on the page, never two', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a mouse')
  test.setTimeout(60_000)
  await seenStory(page)
  await page.goto('/market')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await page.getByRole('button', { name: 'Liquidity shock' }).click()
  await page.waitForTimeout(6000)
  const book = page.locator('[data-market-book]')
  await book.scrollIntoViewIfNeeded()
  // Back before the shock, in the calm: the book's label and the readouts must agree on the stress then.
  await expect(async () => {
    const box = (await book.boundingBox())!
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2)
    await page.mouse.move(box.x + box.width * 0.08, box.y + box.height / 2, { steps: 5 })
    await expect(page.locator('[data-market-book-title]')).toContainText('s ago', { timeout: 1000 })
  }).toPass({ timeout: 15_000 })
  await page.waitForTimeout(400)
  // The label and the readouts read in the same task, so both are of one drawn frame.
  const [label, stressShown] = await page.evaluate(() => {
    const dd = [...document.querySelectorAll('dd')].find((d) => d.querySelector('[data-market-value]') && d.previousElementSibling?.textContent?.startsWith('Stress'))
    return [document.querySelector('[data-market-book-title]')?.textContent ?? '', dd?.textContent ?? '']
  })
  // The label keeps each item whole on screen (no-break spaces inside it): any space.
  expect(stressShown).toBe(/stress\s(\d\.\d\d)/.exec(label)![1]!)
})

test('the book reads the market at a moment by keyboard, and the surface turns with the arrow keys', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a keyboard')
  test.setTimeout(60_000)
  await seenStory(page)
  await page.goto('/market')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  const book = page.locator('[data-market-book]')
  await book.focus()
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  // Its value is the moment against now: back is down, as a slider's is.
  await expect(book).toHaveAttribute('aria-valuenow', '-2.5')
  await expect(book).toHaveAttribute('aria-valuetext', /^2\.5 s ago · vol \d+\.\d% · stress \d\.\d\d$/)
  await expect(page.locator('[data-market-book-title]')).toContainText('2.5 s ago')
  await page.keyboard.press('ArrowRight')
  await expect(book).toHaveAttribute('aria-valuenow', '-2.0')
  await page.keyboard.press('Home')
  await expect(book).toHaveAttribute('aria-valuenow', '-20.0')
  await page.keyboard.press('End')
  await expect(book).toHaveAttribute('aria-valuetext', 'now')
  const surface = page.locator('[data-market-surface]')
  await surface.focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
})

test('Fig. 2 fills its rail with the market’s own rates at a laptop’s width', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the margin shows from lg')
  test.setTimeout(60_000)
  await seenStory(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/market')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  const rail = page.locator('#fig-2 dd:visible')
  await expect.poll(() => rail.allTextContents(), { timeout: 10_000 }).not.toContain('—')
  await expect(rail.first()).toContainText(/a second/)
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
  // Fifty presses in one task, well inside a second.
  await page.locator('[data-market-shock]').evaluate((b) => {
    for (let i = 0; i < 50; i++) (b as HTMLButtonElement).click()
  })
  await expect(page.locator('[data-market-story]')).toHaveAttribute('data-market-story', /shock|topped/, { timeout: 5_000 })
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
  // The shocked frames over the calm ones, shown; then hidden again, the calm ones under them all along.
  const shocked = page.locator('[data-market-shocked]:has([data-market-poster="book"][data-moment="shock"])')
  await expect(shocked).toHaveAttribute('data-market-shocked', '1')
  await expect(shocked).toHaveCSS('opacity', '1')
  await expect(page.locator('#fig-1 img[src="/market/fan-shock.svg"]')).toHaveCount(1)
  await toggle.click()
  await expect(shocked).toHaveAttribute('data-market-shocked', '0')
  await expect(shocked).toHaveCSS('opacity', '0')
  await expect(page.locator('[data-market-poster="book"][data-moment="calm"]')).toHaveCount(1)
  await page.waitForTimeout(2_000)
  expect(workers).toEqual([])
  expect(errors).toEqual([])
})

test.describe('a browser with no WebGL2', () => {
  test('keeps the still frames and starts no worker: a headless audit, or a blocklisted GPU, runs nothing it cannot draw', async ({ page }) => {
    const errors = errorsOf(page)
    const workers: string[] = []
    page.on('worker', (w) => workers.push(w.url()))
    await page.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === 'webgl2') return null
        return (get as (...a: unknown[]) => unknown).call(this, type, ...rest)
      } as typeof get
    })
    await page.goto('/market')
    await page.evaluate(() => document.querySelector('[data-market-stage]')?.scrollIntoView({ block: 'start' }))
    await expect(page.locator('#fig-1')).toContainText('Still frames: this browser has no WebGL2, so the market is not run here.')
    await page.waitForTimeout(2_500)
    expect(workers).toEqual([])
    await expect(page.locator('[data-market-still-shock]')).toHaveText('Liquidity shock')
    expect(errors).toEqual([])
  })
})
