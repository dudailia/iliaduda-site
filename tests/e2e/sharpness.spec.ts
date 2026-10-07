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
// The drum's median bound is wider: its wireframe lies over a shaded sheet whose gradients enter the scan (1.68 at 2× on
// a laptop's GPU, 1.86 on CI's rasterizer). Drawn at 1.5× and stretched to 3×, as before, it measured 2.82.
const FIGURES: readonly { route: string; fig: string; p75?: number; median?: number }[] = [
  { route: '/', fig: '#fig-futures', p75: 2.3 },
  { route: '/market', fig: '#fig-1', p75: 2.3 },
  { route: '/order-book', fig: '#fig-order-book' },
  { route: '/iv-surface', fig: '#fig-iv-surface', p75: 2.3 },
  { route: '/membrane', fig: '#fig-membrane', p75: 2.4, median: 2.0 },
]

// The phones and the small tablet the site is checked on, at their own densities, the browser's bars taken out of the
// viewport as they are on the device: the fractional Android ratios (2.625, 2.8125) are the ones a canvas sized by
// rounding gets wrong. Landscape where a figure is framed by the screen's height: the shortest phone and an Android.
const phone = { isMobile: true, hasTouch: true } as const
const SCREENS = [
  { name: 'a 2× laptop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
  { name: 'a 3× phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, ...phone },
  { name: 'an iPhone SE (2×)', viewport: { width: 375, height: 548 }, deviceScaleFactor: 2, ...phone },
  { name: 'an iPhone 15 (3×)', viewport: { width: 393, height: 659 }, deviceScaleFactor: 3, ...phone },
  { name: 'an iPhone 17 (3×)', viewport: { width: 402, height: 681 }, deviceScaleFactor: 3, ...phone },
  { name: 'an iPhone Pro Max (3×, 430)', viewport: { width: 430, height: 739 }, deviceScaleFactor: 3, ...phone },
  { name: 'an iPhone Pro Max (3×, 440)', viewport: { width: 440, height: 763 }, deviceScaleFactor: 3, ...phone },
  { name: 'a Pixel 8 (2.625×)', viewport: { width: 412, height: 839 }, deviceScaleFactor: 2.625, ...phone },
  { name: 'a Galaxy S24 (3×)', viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, ...phone },
  { name: 'a Galaxy S24 at 384 (2.8125×)', viewport: { width: 384, height: 832 }, deviceScaleFactor: 2.8125, ...phone },
  { name: 'an iPad mini (2×)', viewport: { width: 744, height: 1062 }, deviceScaleFactor: 2, ...phone },
  { name: 'an iPhone SE in landscape (2×)', viewport: { width: 667, height: 326 }, deviceScaleFactor: 2, ...phone },
  { name: 'a Pixel 8 in landscape (2.625×)', viewport: { width: 863, height: 360 }, deviceScaleFactor: 2.625, ...phone },
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

    for (const { route, fig, p75: tail, median: most = 1.8 } of FIGURES) {
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
        expect(median, 'median edge rise, device pixels').toBeLessThanOrEqual(most)
        if (tail) expect(p75, 'edge rise, 75th percentile, device pixels').toBeLessThanOrEqual(tail)
      })
    }
  })
}

/**
 * Every canvas on every page (the Contents' minis, the 2D panes, the stills) and every raster image, on the phones'
 * three densities: a canvas's backing store is its CSS box at the screen's density, and a photograph's chosen source
 * has at least as many pixels as the box shows. Vector images (SVG) are sharp at any density and are not counted.
 */
const DENSITIES = [
  { name: 'a 3× iPhone', viewport: { width: 393, height: 659 }, deviceScaleFactor: 3 },
  { name: 'a 2.625× Pixel', viewport: { width: 412, height: 839 }, deviceScaleFactor: 2.625 },
  { name: 'a 2.8125× Galaxy', viewport: { width: 384, height: 832 }, deviceScaleFactor: 2.8125 },
  { name: 'a 3× phone in landscape', viewport: { width: 734, height: 343 }, deviceScaleFactor: 3 },
] as const

for (const screen of DENSITIES) {
  test.describe(`every canvas and photograph on ${screen.name}`, () => {
    test.use({ viewport: screen.viewport, deviceScaleFactor: screen.deviceScaleFactor, isMobile: true, hasTouch: true, colorScheme: 'light' })
    for (const route of ['/', '/market', '/order-book', '/iv-surface', '/membrane', '/about', '/cricstate', '/closebooks']) {
      test(`${route}: at the screen's own pixels`, async ({ page }, info) => {
        test.skip(info.project.name !== 'desktop', 'one run: the screens are set here')
        test.setTimeout(90_000)
        await page.goto(route)
        // Down the page a screen at a time, so each figure scrolls into view and starts.
        const height = await page.evaluate(() => document.documentElement.scrollHeight)
        for (let y = 0; y < height; y += screen.viewport.height * 0.8) {
          await page.evaluate((top) => window.scrollTo(0, top), y)
          await page.waitForTimeout(350)
        }
        await page.waitForTimeout(1500)
        const off = await page.evaluate(async () => {
          const out: string[] = []
          for (const c of document.querySelectorAll('canvas')) {
            const r = c.getBoundingClientRect()
            if (!r.width || !r.height || Number(getComputedStyle(c).opacity) === 0 || !c.width) continue
            const w = r.width * devicePixelRatio, h = r.height * devicePixelRatio
            if (Math.abs(c.width - w) > 1 || Math.abs(c.height - h) > 1) out.push(`canvas ${c.closest('[id]')?.id ?? '?'} ${c.width}×${c.height} for ${w.toFixed(1)}×${h.toFixed(1)}`)
          }
          for (const img of document.querySelectorAll('img')) {
            const r = img.getBoundingClientRect()
            if (!r.width || !img.naturalWidth || /\.svg(\?|$)/.test(img.currentSrc)) continue
            // naturalWidth is the srcset's density-corrected width (the `sizes` slot): the file's own pixels, decoded.
            const file = new Image()
            file.src = img.currentSrc
            await file.decode()
            if (file.naturalWidth < r.width * devicePixelRatio - 1) out.push(`img ${img.currentSrc.split('/').pop()} ${file.naturalWidth}w for ${(r.width * devicePixelRatio).toFixed(0)} device px`)
          }
          return out
        })
        expect(off, 'drawn below the screen’s density').toEqual([])
      })
    }
  })
}
