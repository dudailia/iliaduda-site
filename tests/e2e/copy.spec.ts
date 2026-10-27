import { expect, test } from '@playwright/test'
import { FORBIDDEN, allowPhone, allowPrereg, exempt } from '../forbidden'
import { ROUTES } from './routes'

/**
 * The source-level gate in tests/copy.test.ts scans files. This one scans what
 * a reader actually receives, because a template can assemble a phrase from
 * pieces the source scan sees separately. Same list, every pattern.
 */
for (const route of ROUTES) {
  test(`${route} ships no retracted claim`, async ({ page }) => {
    await page.goto(route)
    const text = allowPrereg(allowPhone(await page.locator('body').innerText(), route), route)
    const hits = FORBIDDEN.filter(([r]) => !exempt(r, route) && r.test(text)).map(([r, why]) => `${r.source} (${why})`)
    expect(hits).toEqual([])
  })
}
