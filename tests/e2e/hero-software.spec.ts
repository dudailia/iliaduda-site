import { expect, test } from '@playwright/test'
import { STAGE, canvasShown, errorsOf, fillOpacity } from './hero-kit'

/**
 * The home figure where WebGL is drawn in software — what headless audits,
 * Lighthouse among them, run on. The live figure declines, and the finished
 * poster the page painted without its futures fades in, saying why.
 */

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })

test('keeps the finished poster, fades it in, and says why', async ({ page }) => {
  const errors = errorsOf(page)
  await page.goto('/')
  await page.locator(STAGE).scrollIntoViewIfNeeded()
  await expect(page.getByText('Still frame: this browser draws WebGL in software.')).toBeVisible({ timeout: 10_000 })
  expect(await page.evaluate(() => document.documentElement.dataset.futuresSeq)).toBeUndefined()
  await expect.poll(() => fillOpacity(page), { timeout: 2_000 }).toBe(1)
  expect(await canvasShown(page)).toBe(false)
  expect(errors).toEqual([])
})
