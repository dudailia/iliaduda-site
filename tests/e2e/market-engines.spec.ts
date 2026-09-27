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
