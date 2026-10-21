import { expect, test } from '@playwright/test'
import { STAGE, canvasShown, errorsOf, fillOpacity, settle } from './hero-kit'

/**
 * The home figure where WebGL is drawn in software — what headless audits,
 * Lighthouse among them, run on. The live figure declines, and says why; the
 * still frame, the resting view in depth drawn once on a 2D canvas, takes the
 * place of the flat poster.
 *
 * Every step waits for the state it checks, not for a number of seconds: the poster's fill and the still frame each
 * fade in over 240ms, the still frame is drawn a slice of paths per frame first, and all of it moves only as fast as
 * the page draws frames. It runs by itself after the other suites (playwright.config.ts, project "software"), where no
 * other worker is rasterizing WebGL on the same CPU; the waits are for a busy machine all the same.
 */

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })

test('declines, says why, and draws the still frame in depth in place of the flat poster', async ({ page }) => {
  test.setTimeout(90_000)
  const errors = errorsOf(page)
  await page.goto('/')
  await page.locator(STAGE).scrollIntoViewIfNeeded()
  await expect(page.getByText('Still frame: this browser draws WebGL in software.')).toBeVisible({ timeout: 30_000 })
  expect(await page.evaluate(() => document.documentElement.dataset.futuresSeq)).toBeUndefined()
  // Declined, the sequence's mark is gone and the finished picture fades in on the poster.
  await settle(page.locator('[data-futures-poster] [data-fill]').first())
  expect(await fillOpacity(page)).toBe(1)
  expect(await canvasShown(page)).toBe(false)
  // The still frame is shown once its last slice is drawn (React sets its target), then fades in over the poster.
  const still = page.locator(`${STAGE} [data-still-canvas]`)
  await expect.poll(() => still.evaluate((c) => (c as HTMLCanvasElement).style.opacity), { timeout: 60_000 }).toBe('1')
  await settle(still)
  expect(await still.evaluate((c) => Number(getComputedStyle(c).opacity))).toBe(1)
  // The poster under it is hidden at the end of the fade (its visibility steps after 240ms).
  const poster = page.locator(`${STAGE} [data-futures-poster]`)
  await settle(poster)
  await expect(poster).toBeHidden()
  expect(errors).toEqual([])
})
