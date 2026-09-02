import { expect, test } from '@playwright/test'
import { ROUTES } from './routes'

for (const route of ROUTES) {
  test(`${route} does not scroll horizontally at 360px`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await page.goto(route)
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth, `${route} overflows by ${scrollWidth - clientWidth}px`).toBeLessThanOrEqual(
      clientWidth,
    )
  })
}
