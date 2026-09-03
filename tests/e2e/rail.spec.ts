import { expect, test } from '@playwright/test'
import { ROUTES } from './routes'

/**
 * The margin rail carries two different things — section headings and
 * limitation notes — and they are positioned by different mechanisms: headings
 * are grid cells, notes are absolutely positioned out of the text column. When
 * a section opened with an annotated paragraph the two landed on the same
 * coordinates and printed over each other, on five pages at once.
 *
 * Nothing else caught it. Axe does not model overlap, the viewBox gate only
 * covers figures, and the page still had no horizontal overflow. So this
 * asserts the thing that was actually wrong: no note may intersect a heading.
 */
for (const route of ROUTES) {
  test(`${route} never prints one rail item over another`, async ({ page }) => {
    await page.goto(route)
    const overlaps = await page.evaluate(() => {
      const rect = (el: Element) => el.getBoundingClientRect()
      const hit = (a: DOMRect, b: DOMRect) =>
        a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
      // Every item that occupies the rail, not just notes against headings.
      // The first version of this gate compared notes to headings only, and a
      // section with two annotated paragraphs printed one note over the other
      // for as long as that was the rule.
      const items = [
        ...document.querySelectorAll('aside'),
        ...document.querySelectorAll('h1, h2, h3'),
      ].filter((n) => rect(n).width > 0)
      const label = (n: Element) =>
        `${n.tagName.toLowerCase()} "${(n.textContent ?? '').trim().slice(0, 30)}"`
      const out: string[] = []
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i] as Element
          const b = items[j] as Element
          if (a.contains(b) || b.contains(a)) continue
          if (hit(rect(a), rect(b))) out.push(`${label(a)} overlaps ${label(b)}`)
        }
      }
      return out
    })
    expect(overlaps).toEqual([])
  })
}
