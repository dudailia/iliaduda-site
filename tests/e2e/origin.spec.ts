import { expect, test } from '@playwright/test'
import { ROUTES } from './routes'

/**
 * The site claims no third-party requests. This asserts it rather than trusting
 * that nobody adds an embed later: every request a page makes must be
 * same-origin or a data URI.
 */
for (const route of ROUTES) {
  test(`${route} makes no off-origin request`, async ({ page, baseURL }) => {
    const foreign: string[] = []
    page.on('request', (req) => {
      const url = req.url()
      if (url.startsWith('data:') || url.startsWith('blob:')) return
      if (baseURL && url.startsWith(baseURL)) return
      foreign.push(url)
    })
    await page.goto(route, { waitUntil: 'load' })
    await page.waitForLoadState('networkidle')
    expect(foreign).toEqual([])
  })
}
