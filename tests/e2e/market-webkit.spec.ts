import { expect, test } from '@playwright/test'
import { errorsOf } from './hero-kit'

/**
 * /market in WebKit at an iPhone's size, touch and pixel ratio (the `iphone` project): the figure goes live, its
 * worker a module worker from the site's own origin, and a shock lands in all three views in one frame; or it keeps
 * its still frames and says why. Either way the page is left clean. That JavaScriptCore computes Node's shocked
 * market, bit for bit, is market-engines.spec.ts.
 */

test('goes live or says why, lands a shock in all three views at once, and leaves the page clean', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  const warned: string[] = []
  page.on('console', (m) => m.type() === 'warning' && warned.push(m.text()))
  const shocked: string[] = []
  page.on('request', (r) => r.url().includes('-shock.svg') && shocked.push(r.url()))
  await page.addInitScript(() => sessionStorage.setItem('market-seq', '1'))
  await page.goto('/market')
  await page.evaluate(() => document.querySelector('[data-market-stage]')?.scrollIntoView({ block: 'start' }))
  const stage = page.locator('[data-market-stage]')
  const live = await expect(stage)
    .toHaveAttribute('data-market-live', '1', { timeout: 20_000 })
    .then(() => true)
    .catch(() => false)
  if (live) {
    // As a reader looking at all three views presses it: the button is under them, and a tap that scrolled it into
    // view would carry the surface off the screen, where it does not draw.
    await page.locator('[data-market-shock]').evaluate((b) => (b as HTMLButtonElement).click())
    const stamps = () => page.locator('[data-market-stage] canvas:not([data-ghost]):not([data-still-sheet])').evaluateAll((cs) => cs.map((c) => (c as HTMLCanvasElement).dataset.landed ?? null))
    await expect.poll(async () => (await stamps()).every((s) => s !== null), { timeout: 5_000 }).toBe(true)
    expect(new Set(await stamps()).size).toBe(1)
  } else await expect(page.locator('#fig-1').getByText(/Still frames/).first()).toBeVisible()
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(sw).toBeLessThanOrEqual(cw)
  // The still frames of a shock are fetched only to be shown: nothing preloads them.
  expect(shocked).toEqual([])
  expect(warned.filter((w) => /preload/i.test(w))).toEqual([])
  expect(errors).toEqual([])
})
