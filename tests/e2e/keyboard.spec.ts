import { expect, test } from '@playwright/test'
import { ROUTES } from './routes'

for (const route of ROUTES) {
  test(`${route} gives every interactive element a visible focus ring`, async ({ page }) => {
    // Reduced motion: a figure that streams in on view (CloseBooks) adds its
    // buttons mid-loop otherwise, and the rings do not depend on motion.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(route)
    // Everything in the tab order. Elements with tabindex=-1 are out of it by
    // design (a thumbnail that duplicates its title link, the inactive options
    // of a roving radio group) and are reached another way; so is anything
    // display:none at this width (the OFZ figure's endpoint marks on a phone).
    const targets = page
      .locator('a[href]:not([tabindex="-1"]), button:not([tabindex="-1"]), [tabindex="0"]')
      .filter({ visible: true })
    const count = await targets.count()
    expect(count).toBeGreaterThan(0)

    for (let i = 0; i < count; i++) {
      const el = targets.nth(i)
      await el.focus()
      const ring = await el.evaluate((node) => {
        const s = getComputedStyle(node)
        return {
          outlineStyle: s.outlineStyle,
          outlineWidth: s.outlineWidth,
          outlineColor: s.outlineColor,
        }
      })
      const visible =
        ring.outlineStyle !== 'none' && Number.parseFloat(ring.outlineWidth) >= 1
      expect(visible, `no focus ring on element ${i} of ${route}: ${JSON.stringify(ring)}`).toBe(
        true,
      )
    }
  })
}

test('the skip link is the first thing Tab reaches and it works', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  const focused = await page.evaluate(() => ({
    text: document.activeElement?.textContent?.trim(),
    href: (document.activeElement as HTMLAnchorElement | null)?.getAttribute('href'),
  }))
  expect(focused.href).toBe('#main')
  expect(focused.text).toBe('Skip to content')
})
