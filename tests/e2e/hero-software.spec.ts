import { expect, test } from '@playwright/test'
import { STAGE, canvasShown, errorsOf, fillOpacity } from './hero-kit'

/**
 * The home figure where WebGL is drawn in software — what headless audits,
 * Lighthouse among them, run on. The live figure declines, and says why; the
 * still frame, the resting view in depth drawn once on a 2D canvas, takes the
 * place of the flat poster.
 */

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })

test('declines, says why, and draws the still frame in depth in place of the flat poster', async ({ page }) => {
  const errors = errorsOf(page)
  await page.goto('/')
  await page.locator(STAGE).scrollIntoViewIfNeeded()
  await expect(page.getByText('Still frame: this browser draws WebGL in software.')).toBeVisible({ timeout: 10_000 })
  expect(await page.evaluate(() => document.documentElement.dataset.futuresSeq)).toBeUndefined()
  await expect.poll(() => fillOpacity(page), { timeout: 2_000 }).toBe(1)
  expect(await canvasShown(page)).toBe(false)
  const still = page.locator(`${STAGE} [data-still-canvas]`)
  await expect.poll(() => still.evaluate((c) => Number(getComputedStyle(c).opacity)), { timeout: 10_000 }).toBe(1)
  await expect(page.locator(`${STAGE} [data-futures-poster]`)).toBeHidden()
  expect(errors).toEqual([])
})
