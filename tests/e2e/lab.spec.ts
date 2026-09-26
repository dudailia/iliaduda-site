import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { FORBIDDEN } from '../forbidden'

/**
 * The hero prototypes under /lab. Unlinked and noindex, but held to the same
 * floor as every page: accessible, same-origin, no horizontal scroll, the
 * poster first, reduced motion honoured, and the copy gates.
 */

export const LAB = ['/lab/b', '/lab/c'] as const

test('robots.txt disallows /lab and the sitemap does not list it', async ({ request }) => {
  expect(await (await request.get('/robots.txt')).text()).toMatch(/Disallow: \/lab/)
  expect(await (await request.get('/sitemap.xml')).text()).not.toContain('/lab')
})

for (const route of LAB) {
  test.describe(route, () => {
    test('is noindex and makes no off-origin request', async ({ page, baseURL }) => {
      const off: string[] = []
      page.on('request', (r) => {
        const u = new URL(r.url())
        if (!['data:', 'blob:'].includes(u.protocol) && u.origin !== new URL(baseURL!).origin) off.push(r.url())
      })
      await page.goto(route, { waitUntil: 'networkidle' })
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
      expect(off).toEqual([])
    })

    test('has no accessibility violations', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(route)
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze()
      expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
    })

    test('does not scroll horizontally', async ({ page }) => {
      await page.goto(route)
      const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
      expect(sw).toBeLessThanOrEqual(cw)
    })

    test('reduced motion: the poster is the hero and no canvas is shown', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(route, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1500)
      await expect(page.locator('[data-lab-poster]').first()).toBeVisible()
      const shown = await page.locator('canvas').evaluateAll((cs) => cs.filter((c) => getComputedStyle(c).visibility !== 'hidden' && Number(getComputedStyle(c).opacity) > 0).length)
      expect(shown).toBe(0)
    })

    test('ships no retracted or banned claim', async ({ page }) => {
      await page.goto(route)
      const text = await page.locator('body').innerText()
      const hits = FORBIDDEN.filter(([r]) => r.test(text)).map(([r, why]) => `${r.source} (${why})`)
      expect(hits).toEqual([])
    })
  })
}
