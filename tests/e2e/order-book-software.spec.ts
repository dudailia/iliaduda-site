import { expect, test } from '@playwright/test'

/**
 * /order-book where WebGL is drawn in software, as headless audits run it. Its terrain would draw on the CPU at a
 * third of the display's rate and drag Fig. 2 down with it, so Fig. 1 keeps its still frame and says why, as the home
 * figure and the IV surface do; Fig. 2 draws that same moment, still.
 */

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })

test('keeps its still frame in software and says why; Fig. 2 draws the same moment, still', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() => sessionStorage.setItem('orderbook-seq', '1'))
  await page.goto('/order-book')
  await page.locator('#fig-order-book').scrollIntoViewIfNeeded()
  await expect(page.locator('#fig-order-book').getByText('Still frame: this browser draws WebGL in software.')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('#fig-order-book [data-orderbook-poster]')).toBeVisible()
  // Nothing goes live: no canvas on either figure is shown.
  await page.waitForTimeout(1_500)
  const shown = await page.locator('#fig-order-book canvas, #fig-order-flow canvas').evaluateAll((cs) => cs.filter((c) => Number(getComputedStyle(c).opacity) > 0).length)
  expect(shown).toBe(0)
  expect(errors).toEqual([])
})
