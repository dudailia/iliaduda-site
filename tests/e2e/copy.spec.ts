import { expect, test } from '@playwright/test'
import { ROUTES } from './routes'

/**
 * The source-level gate in tests/copy.test.ts scans files. This one scans what
 * a reader actually receives, because a template can assemble a phrase from
 * pieces the source scan sees separately.
 */
const FORBIDDEN = [
  /real money/i,
  /real clients/i,
  /production[- ]grade/i,
  /battle[- ]tested/i,
  /\benterprise[-\s](ready|grade|class|scale)\b/i,
  /state street/i,
  /first real[- ]time/i,
  /1,247/,
  /automated 1099 filing/i,
  /\bhonest(y|ly)?\b/i,
]

for (const route of ROUTES) {
  test(`${route} ships no retracted claim`, async ({ page }) => {
    await page.goto(route)
    const text = await page.locator('body').innerText()
    const hits = FORBIDDEN.filter((r) => r.test(text)).map((r) => r.source)
    expect(hits).toEqual([])
  })
}
