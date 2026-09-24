import { expect, test } from '@playwright/test'
import { REDIRECTS } from './routes'

/** Links to these were pasted into email; they must land somewhere real. */
for (const [from, to] of REDIRECTS) {
  test(`${from} permanently redirects to ${to}`, async ({ request }) => {
    const res = await request.get(from, { maxRedirects: 0 })
    expect(res.status()).toBe(308)
    expect(res.headers()['location']).toBe(to)
  })
}
