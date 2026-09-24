import { expect, test } from '@playwright/test'
import { FORBIDDEN } from '../forbidden'
import { ROUTES } from './routes'

/**
 * The source-level gate in tests/copy.test.ts scans files. This one scans what
 * a reader actually receives, because a template can assemble a phrase from
 * pieces the source scan sees separately. Same list, every pattern.
 */
for (const route of ROUTES) {
  test(`${route} ships no retracted claim`, async ({ page }) => {
    await page.goto(route)
    const text = await page.locator('body').innerText()
    const hits = FORBIDDEN.filter(([r]) => r.test(text)).map(([r, why]) => `${r.source} (${why})`)
    expect(hits).toEqual([])
  })
}
