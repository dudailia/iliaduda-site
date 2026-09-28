import { expect, test } from '@playwright/test'
import { GPU } from './hero-kit'

/**
 * A live figure goes live in place: the buttons it adds (Pause, Replay, Fly
 * through) arrive where room was already kept for them, so nothing under the
 * figure moves, on a laptop or on a phone, where they wrap onto a row of their
 * own. Lighthouse cannot see this: its phone run draws in software, so the
 * figures never go live there.
 */

test.use({ launchOptions: { args: GPU } })

const PAGES = [
  { route: '/', figures: ['#fig-futures'], seen: 'futures-seq' },
  { route: '/order-book', figures: ['#fig-order-book', '#fig-order-flow'], seen: 'orderbook-seq' },
  { route: '/iv-surface', figures: ['#fig-iv-surface'], seen: 'surface-seq' },
]

for (const { route, figures, seen } of PAGES)
  test(`${route}: going live moves nothing under its figures`, async ({ page }) => {
    test.setTimeout(60_000)
    // Each caption's place in its figure as the server laid it out, before any of the page's own script has run.
    await page.addInitScript(
      ([k, sels]) => {
        sessionStorage.setItem(k, '1')
        document.addEventListener('DOMContentLoaded', () => {
          const w = window as unknown as { __before: Record<string, number> }
          w.__before = {}
          for (const s of sels) {
            const e = document.querySelector(s)!
            w.__before[s] = e.querySelector('figcaption')!.getBoundingClientRect().y - e.getBoundingClientRect().y
          }
        })
      },
      [seen, figures] as const,
    )
    await page.goto(route)
    for (const f of figures) {
      const fig = page.locator(f)
      await fig.scrollIntoViewIfNeeded()
      const live = await expect
        .poll(() => fig.locator('canvas:not([data-still-canvas])').first().evaluate((c) => Number(getComputedStyle(c).opacity) > 0.5), { timeout: 20_000 })
        .toBe(true)
        .then(() => true, () => false)
      if (!live) return test.skip(true, 'no GPU here')
      await page.waitForTimeout(600)
      const [before, now] = await fig.evaluate(
        (e, s) => [(window as unknown as { __before: Record<string, number> }).__before[s]!, e.querySelector('figcaption')!.getBoundingClientRect().y - e.getBoundingClientRect().y],
        f,
      )
      expect(Math.abs(now - before), f).toBeLessThan(0.5)
    }
  })
