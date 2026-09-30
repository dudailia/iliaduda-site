import { expect, test, type Page } from '@playwright/test'
import { GPU, goLive, seen } from './hero-kit'

/**
 * A 30 Hz clock, as an iPhone in Low Power Mode or a laptop saving energy holds a page to: the stage's governor learns
 * it within seconds and tells the home figure's pricing, whose own learner alone would take the best part of a minute.
 * It runs by itself, after every other suite (playwright.config.ts, project "clock"): on a machine busy with the rest,
 * the page's frames would come slower than any display's rate, which is not what it tests.
 */

test.use({ launchOptions: { args: GPU } })

const panel = (page: Page) => page.locator('[data-stage-debug]')
const row = (page: Page, k: string | RegExp) =>
  panel(page)
    .locator('div')
    .filter({ has: page.locator('dt', { hasText: k }) })
    .locator('dd')

test('a 30 Hz clock (Low Power Mode) is the clock the pricing is judged by, within seconds', async ({ page }) => {
  test.setTimeout(60_000)
  // The page's animation frames come on every other frame of the display, stamped 1/30 s apart, as they are on an
  // iPhone in Low Power Mode: every callback asked for waits for the next even frame, and a cancelled one never runs.
  // (As a string: the test's own transform would wrap the named functions in a helper the page does not have.)
  await page.addInitScript(`(() => {
    const raf = window.requestAnimationFrame.bind(window)
    let queue = new Map(), id = 0, frame = 0, pumping = false
    let base = -1
    const pump = (t) => {
      frame++
      if (base < 0) base = t
      if (frame % 2 === 0) {
        const due = queue
        queue = new Map()
        // The frame's time as a 30 Hz clock stamps it, exactly: a busy machine's late frames do not blur the clock.
        const at = base + (frame / 2) * (1000 / 30)
        for (const cb of due.values()) cb(at)
      }
      if (queue.size) raf(pump)
      else pumping = false
    }
    window.requestAnimationFrame = (cb) => {
      queue.set(++id, cb)
      if (!pumping) {
        pumping = true
        raf(pump)
      }
      return id
    }
    window.cancelAnimationFrame = (n) => void queue.delete(n)
  })()`)
  await seen(page)
  await page.goto('/?debug=1')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  // The stage's governor learns it within about three seconds and tells the pricing; alone, the pricing's own
  // learner would take the best part of a minute.
  await expect
    .poll(async () => Number.parseFloat((await row(page, /^clock$/).textContent()) ?? '0'), { timeout: 10_000 })
    .toBeGreaterThan(28)
})
