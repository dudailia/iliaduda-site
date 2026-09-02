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
  test(`${route} never prints a margin note over a heading`, async ({ page }) => {
    await page.goto(route)
    const overlaps = await page.evaluate(() => {
      const rect = (el: Element) => el.getBoundingClientRect()
      const hit = (a: DOMRect, b: DOMRect) =>
        a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
      const notes = [...document.querySelectorAll('aside')].filter((n) => rect(n).width > 0)
      const heads = [...document.querySelectorAll('h1, h2, h3')].filter((n) => rect(n).width > 0)
      const out: string[] = []
      for (const note of notes) {
        for (const head of heads) {
          if (hit(rect(note), rect(head))) {
            out.push(
              `note "${(note.textContent ?? '').trim().slice(0, 34)}…" overlaps heading "${(head.textContent ?? '').trim().slice(0, 34)}"`,
            )
          }
        }
      }
      return out
    })
    expect(overlaps).toEqual([])
  })
}
