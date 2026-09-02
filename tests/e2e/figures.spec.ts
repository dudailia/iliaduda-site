import { expect, test } from '@playwright/test'
import { ROUTES } from './routes'

/**
 * Nothing inside a figure may extend past its own viewBox.
 *
 * Two figures shipped clipped during this build — a row label whose text ran
 * off the left edge, and a legend below the bottom edge — and every other gate
 * passed both times. A screenshot caught them, which means the guard was a
 * person looking, and a person looking is not a guard.
 *
 * getBBox() returns the union of the rendered content in user units, so
 * comparing it against the declared viewBox catches anything authored outside
 * the frame regardless of which edge it left by.
 */
for (const route of ROUTES) {
  test(`${route} figures fit inside their own viewBox`, async ({ page }) => {
    await page.goto(route)
    const problems = await page.evaluate(() => {
      const out: string[] = []
      for (const svg of document.querySelectorAll<SVGSVGElement>('svg[role="img"]')) {
        if (!svg.getBoundingClientRect().width) continue // the hidden arrangement
        const vb = svg.viewBox.baseVal
        const b = (svg as unknown as SVGGraphicsElement).getBBox()
        const id = svg.closest('figure')?.id ?? 'unknown'
        const eps = 0.5
        if (b.x < vb.x - eps) out.push(`${id}: content starts ${(vb.x - b.x).toFixed(1)} left of viewBox`)
        if (b.y < vb.y - eps) out.push(`${id}: content starts ${(vb.y - b.y).toFixed(1)} above viewBox`)
        if (b.x + b.width > vb.x + vb.width + eps)
          out.push(`${id}: content runs ${(b.x + b.width - vb.x - vb.width).toFixed(1)} past the right edge`)
        if (b.y + b.height > vb.y + vb.height + eps)
          out.push(`${id}: content runs ${(b.y + b.height - vb.y - vb.height).toFixed(1)} below the bottom edge`)
      }
      return out
    })
    expect(problems).toEqual([])
  })
}
