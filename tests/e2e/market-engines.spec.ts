import { expect, test } from '@playwright/test'

/**
 * One market in every engine. The market computes its own exp and log from
 * IEEE arithmetic (lib/market/detmath.ts), so V8, JavaScriptCore and
 * SpiderMonkey should run the seeded market identically: twenty simulated
 * seconds past the still frame, each must reach the fingerprint pinned from
 * Node (lib/market/fingerprint.ts). This runs in Chromium (desktop), WebKit
 * (iphone) and, where it is installed, Firefox (firefox).
 */

test('computes the market Node computes', async ({ page }) => {
  await page.goto('/order-book?debug=1')
  const market = page
    .locator('[data-stage-debug] div')
    .filter({ has: page.locator('dt', { hasText: /^market$/ }) })
    .locator('dd')
  await expect(market).toHaveText(/^same as Node · /, { timeout: 30_000 })
})

test('runs /market’s market as Node does: where the figure opens, and after a liquidity shock', async ({ page }) => {
  test.setTimeout(60_000)
  await page.addInitScript(() => sessionStorage.setItem('market-seq', '1'))
  await page.goto('/market?debug=1')
  await page.evaluate(() => document.querySelector('[data-market-stage]')?.scrollIntoView({ block: 'start' }))
  const row = (k: RegExp) =>
    page
      .locator('[data-stage-debug] div')
      .filter({ has: page.locator('dt', { hasText: k }) })
      .locator('dd')
  // Checked in a worker of its own, whether or not the figure runs live in this browser.
  await expect(row(/^market$/)).toHaveText(/^same as Node · /, { timeout: 30_000 })
  await expect(row(/^shocked market$/)).toHaveText(/^same as Node · /, { timeout: 30_000 })
})
