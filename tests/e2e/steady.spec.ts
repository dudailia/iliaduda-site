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
        .poll(() => fig.locator('canvas:not([data-still-canvas]):not([data-still-sheet])').first().evaluate((c) => Number(getComputedStyle(c).opacity) > 0.5), { timeout: 20_000 })
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

/** Each figure's live buttons arrive as the home figure's do: rising 4px into place, 40ms apart. */
for (const { route, sel, seen } of [
  { route: '/order-book', sel: '[data-orderbook-controls] > button', seen: 'orderbook-seq' },
  { route: '/iv-surface', sel: '[data-surface-controls] [data-live-buttons] > button', seen: 'surface-seq' },
])
  test(`${route}: the live buttons arrive in turn, rising into place, while press and hover stay instant`, async ({ page }) => {
    await page.addInitScript((k) => sessionStorage.setItem(k, '1'), seen)
    await page.goto(route)
    // The controls' row is there from the first paint; its buttons, once the figure it is under goes live.
    await page.locator(sel.replace(/ .*$| > button$/, '')).scrollIntoViewIfNeeded()
    if (!(await page.locator(sel).first().waitFor({ timeout: 20_000 }).then(() => true, () => false))) return test.skip(true, 'no GPU here')
    const t = await page.locator(sel).evaluateAll((bs) =>
      bs.slice(0, 2).map((b) => {
        const c = getComputedStyle(b)
        const props = c.transitionProperty.split(', ')
        const delays = c.transitionDelay.split(', ')
        return Object.fromEntries(props.map((p, i) => [p, delays[i] ?? delays[0]]))
      }),
    )
    expect(t.map((d) => d.translate)).toEqual(['0s', '0.04s'])
    expect(t.map((d) => d.opacity)).toEqual(['0s', '0.04s'])
    expect(t.every((d) => d.scale === '0s' && d['border-color'] === '0s')).toBe(true)
  })
