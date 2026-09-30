import { expect, test } from '@playwright/test'

/**
 * Where WebGL is drawn in software (a virtual machine, a blocklisted driver, a headless audit), each live figure keeps
 * its still frame after all and says why. It says so in place: the room its live buttons and its longest hint would
 * take was kept from the first paint, so nothing under the figure moves when the reason arrives.
 */

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })

const PAGES = [
  { route: '/', figure: '#fig-futures' },
  { route: '/order-book', figure: '#fig-order-book' },
  { route: '/iv-surface', figure: '#fig-iv-surface' },
]

for (const { route, figure } of PAGES)
  test(`${route}: keeping the still frame moves nothing under the figure`, async ({ page }) => {
    await page.addInitScript((sel) => {
      document.addEventListener('DOMContentLoaded', () => {
        const e = document.querySelector(sel)!
        ;(window as unknown as { __before: number }).__before = e.querySelector('figcaption')!.getBoundingClientRect().y - e.getBoundingClientRect().y
      })
    }, figure)
    await page.goto(route)
    const fig = page.locator(figure)
    await fig.scrollIntoViewIfNeeded()
    await expect(fig.getByText(/Still frame: this browser draws WebGL in software/).first()).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(400)
    const [before, now] = await fig.evaluate((e) => [(window as unknown as { __before: number }).__before, e.querySelector('figcaption')!.getBoundingClientRect().y - e.getBoundingClientRect().y])
    expect(Math.abs(now - before)).toBeLessThan(0.5)
  })
