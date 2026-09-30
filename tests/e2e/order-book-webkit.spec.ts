import { expect, test, type Page } from '@playwright/test'
import { errorsOf } from './hero-kit'

/**
 * /order-book in WebKit at an iPhone's size, touch and pixel ratio (the
 * `iphone` project): the figure goes live, or keeps its still frame and says
 * why, and leaves the page clean. That JavaScriptCore computes Node's market,
 * bit for bit, is market-engines.spec.ts. WebKit here is the desktop build,
 * with the desktop's WebGL: the phone's missing extensions are tested in
 * Chromium (order-book.spec.ts).
 */

const STAGE = '#fig-order-book [data-seq]'
const row = (page: Page, k: RegExp) =>
  page
    .locator('[data-stage-debug] div')
    .filter({ has: page.locator('dt', { hasText: k }) })
    .locator('dd')

test('goes live or says why, rises once, and leaves the page clean', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await page.goto('/order-book?debug=1')
  await page.locator(STAGE).scrollIntoViewIfNeeded()
  const figure = row(page, /^figure$/)
  await expect(figure).toHaveText(/^(live|declined: Still frame.*)$/, { timeout: 20_000 })
  if ((await figure.textContent()) === 'live') await expect.poll(() => page.locator(STAGE).getAttribute('data-seq'), { timeout: 15_000 }).toBe('done')
  else await expect(page.locator('#fig-order-book').getByText(/Still frame/).first()).toBeVisible()
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(sw).toBeLessThanOrEqual(cw)
  expect(errors).toEqual([])
})
