import { expect, test, type Page } from '@playwright/test'
import { GPU } from './hero-kit'

/**
 * Every live figure draws at the screen's own device pixels, and its lines are sharp in them.
 *
 * Resolution used to be a quality level: every stage opened at 1.5 device pixels a CSS pixel and held it through its
 * signature, a 3× phone never got past 2, and the IV surface stayed at 1.5 on a phone. Here, at 2× (a MacBook) and 3×
 * (an iPhone), each figure's canvas must be its CSS box at the screen's density from the start, and on a paused frame
 * the lines across it must turn from ground to ink within one to two device pixels: each isolated line in a vertical
 * scan of the captured canvas, its edge rise from 10% to 90% of its depth. A picture drawn at 1.5× and stretched to 3×
 * measures 2.3 (the IV surface's grid lines); drawn at 3×, 1.55.
 */

test.use({ launchOptions: { args: GPU } })

// The 75th percentile bounds the edges' tail where every edge is a line. The order book's terrain is shaded: its folds
// are gradients by design, and they fill that tail (2.4–2.9 px, frame to frame), so its median carries the measure.
const FIGURES: readonly { route: string; fig: string; p75?: number }[] = [
  { route: '/', fig: '#fig-futures', p75: 2.3 },
  { route: '/market', fig: '#fig-1', p75: 2.3 },
  { route: '/order-book', fig: '#fig-order-book' },
  { route: '/iv-surface', fig: '#fig-iv-surface', p75: 2.3 },
]

const SCREENS = [
  { name: 'a 2× laptop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
  { name: 'a 3× phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
] as const

/** Each isolated line's edge rise (10→90% of its depth) along vertical profiles of a luminance image, in pixels. */
function edgeRises(cols: number[][]): number[] {
  const R = 7
  const out: number[] = []
  for (const p of cols) {
    for (const sign of [1, -1]) {
      const q = p.map((v) => sign * v)
      for (let y = R; y < q.length - R; y++) {
        if (!(q[y]! < q[y - 1]! && q[y]! <= q[y + 1]!)) continue
        const a = q[y - R]!, b = q[y + R]!
        const depth = Math.min(a, b) - q[y]!
        // A line alone in its window: deep enough to measure, the ground level on both sides, nothing else as dark.
        if (depth < 14 || Math.abs(a - b) > 0.2 * depth) continue
        if (q.slice(y - R, y + R + 1).filter((v) => v < q[y]! + 0.5 * depth).length > 6) continue
        const cross = (d: number, f: number) => {
          const t = q[y]! + depth * f
          let yy = y
          while (Math.abs(yy - y) < R && q[yy]! < t) yy += d
          const u = q[yy - d]!, v = q[yy]!
          return yy - d + (d * (t - u)) / (v - u || 1)
        }
        out.push(Math.abs(cross(-1, 0.9) - cross(-1, 0.1)), Math.abs(cross(1, 0.9) - cross(1, 0.1)))
      }
    }
  }
  return out
}

const quantile = (a: number[], f: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * f)]!

/** The canvas as captured on screen, decoded in the page: 60 vertical luminance profiles across its middle 80%. */
async function profiles(page: Page, png: Buffer): Promise<number[][]> {
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    const cols: number[][] = []
    for (let k = 0; k < 60; k++) {
      const x = Math.round(c.width * (0.1 + (0.8 * k) / 59))
      const col: number[] = []
      for (let y = 0; y < c.height; y++) {
        const i = (y * c.width + x) * 4
        col.push(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!)
      }
      cols.push(col)
    }
    return cols
  }, png.toString('base64'))
}

for (const screen of SCREENS) {
  test.describe(`on ${screen.name}`, () => {
    test.use({ viewport: screen.viewport, deviceScaleFactor: screen.deviceScaleFactor, isMobile: screen.isMobile, hasTouch: screen.hasTouch, colorScheme: 'light' })

    for (const { route, fig, p75: tail } of FIGURES) {
      test(`${route}: drawn at the screen's own pixels from the first frame, its lines one to two device pixels sharp`, async ({ page }, info) => {
        test.skip(info.project.name !== 'desktop', 'one run: the screens are set here')
        test.setTimeout(60_000)
        await page.goto(route)
        const canvas = page.locator(`${fig} canvas[data-live-canvas]`).first()
        await canvas.scrollIntoViewIfNeeded()
        const live = await expect
          .poll(() => canvas.evaluate((c) => Number(getComputedStyle(c).opacity)), { timeout: 20_000 })
          .toBeGreaterThan(0.99)
          .then(() => true)
          .catch(() => false)
        if (!live) return test.skip(true, 'no GPU here')

        // The backing store, at once (the signature is playing): the CSS box at the screen's density, to a pixel.
        const size = () => canvas.evaluate((c) => {
          const r = c.getBoundingClientRect()
          return { w: c.width, h: c.height, cw: r.width * devicePixelRatio, ch: r.height * devicePixelRatio }
        })
        const first = await size()
        expect(Math.abs(first.w - first.cw), `width ${first.w} for ${first.cw.toFixed(1)} device pixels`).toBeLessThanOrEqual(1)
        expect(Math.abs(first.h - first.ch), `height ${first.h} for ${first.ch.toFixed(1)} device pixels`).toBeLessThanOrEqual(1)

        // A frame held still, mid-story, for the edges: Pause holds every figure.
        await page.waitForTimeout(3000)
        await page.locator(fig).getByRole('button', { name: /^Pause/ }).first().click()
        await page.waitForTimeout(700)
        const later = await size()
        expect(later.w, 'the canvas keeps its size through the story and its quality steps').toBe(first.w)

        const rises = edgeRises(await profiles(page, await canvas.screenshot()))
        expect(rises.length, 'isolated lines found to measure').toBeGreaterThan(60)
        const median = quantile(rises, 0.5), p75 = quantile(rises, 0.75)
        info.annotations.push({ type: 'edges', description: `${rises.length / 2} lines: rise median ${median.toFixed(2)} px, p75 ${p75.toFixed(2)} px` })
        expect(median, 'median edge rise, device pixels').toBeGreaterThan(0.6)
        expect(median, 'median edge rise, device pixels').toBeLessThanOrEqual(1.8)
        if (tail) expect(p75, 'edge rise, 75th percentile, device pixels').toBeLessThanOrEqual(tail)
      })
    }
  })
}
