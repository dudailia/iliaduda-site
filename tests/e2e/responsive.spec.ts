import { expect, test } from '@playwright/test'
import { ROUTES } from './routes'

/**
 * No horizontal scroll at a small phone, a tablet and a laptop. 768 is here
 * because the hero's 3D labels overflowed there and nowhere else: the rail
 * collapses below 1024, so the figure is at its widest single-column size.
 */
for (const width of [360, 768, 1440]) {
  for (const route of ROUTES) {
    test(`${route} does not scroll horizontally at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(route)
      await page.waitForTimeout(width === 768 ? 1500 : 300)
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(scrollWidth, `${route} overflows by ${scrollWidth - clientWidth}px`).toBeLessThanOrEqual(clientWidth)
    })
  }
}
