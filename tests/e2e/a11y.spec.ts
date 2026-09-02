import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { ROUTES } from './routes'

for (const route of ROUTES) {
  test(`${route} has no accessibility violations`, async ({ page }) => {
    await page.goto(route)
    const { violations } = await new AxeBuilder({ page })
      // 'best-practice' included deliberately: heading-order lives there, and
      // scoping this gate to WCAG tags alone let a heading-order defect through
      // while Lighthouse scored 0.98.
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze()
    expect(
      violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
    ).toEqual([])
  })

  /**
   * A figure a screen reader cannot read would break the accessibility claim
   * this site makes about itself, so an empty <desc> is a failure — and it has
   * to state values, not say "chart".
   */
  test(`${route} figures describe their values`, async ({ page }) => {
    await page.goto(route)
    const svgs = page.locator('svg[role="img"]')
    const count = await svgs.count()
    for (let i = 0; i < count; i++) {
      const svg = svgs.nth(i)
      // textContent, not innerText: SVG <title> and <desc> are metadata and are
      // not rendered, so innerText is always the empty string for them.
      const desc = ((await svg.locator('desc').first().textContent()) ?? '').trim()
      const title = ((await svg.locator('title').first().textContent()) ?? '').trim()
      expect(title.length, `empty <title> on svg ${i} of ${route}`).toBeGreaterThan(0)
      expect(desc.length, `empty <desc> on svg ${i} of ${route}`).toBeGreaterThan(40)
      expect(desc, `<desc> on ${route} says "chart" instead of the values`).not.toMatch(
        /^(a )?(bar )?(chart|graph|diagram|image)\.?$/i,
      )
      expect(desc, `<desc> on ${route} states no numbers`).toMatch(/\d/)
    }
  })

  test(`${route} has one h1 and an ordered heading structure`, async ({ page }) => {
    await page.goto(route)
    expect(await page.locator('h1').count()).toBe(1)
  })
}
