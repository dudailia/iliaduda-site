import { describe, expect, it } from 'vitest'
import type { MiniPalette } from '../components/thumbs/paint'
import { thumbFor } from '../lib/thumbs'

/**
 * A miniature's first shown frame is its thumbnail: the frame on which it first says it is ready paints exactly the
 * paths the build wrote into the thumbnail's SVG, so the canvas crossfading in over it changes nothing.
 */

const PAL: MiniPalette = { paper: 'P', rule: 'R', indigo: 'I', wash: 'W' }

/** A 2D context that records the strokes drawn, in the box's own units (a 1000 × 600 canvas). */
function recorder() {
  let path: [number, number][] = []
  const strokes: { style: string; pts: [number, number][] }[] = []
  const g = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: 'miter',
    globalAlpha: 1,
    fillRect() {},
    beginPath: () => (path = []),
    moveTo: (x: number, y: number) => void path.push([x, y]),
    lineTo: (x: number, y: number) => void path.push([x, y]),
    stroke() {
      strokes.push({ style: g.strokeStyle, pts: path })
    },
    arc() {},
    fill() {},
  }
  return { g: g as unknown as CanvasRenderingContext2D, strokes, clear: () => (strokes.length = 0) }
}
const ints = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${Math.round(x)} ${Math.round(y)}`).join('')

describe('an engine miniature’s first shown frame', () => {
  for (const slug of ['market', 'order-book', 'iv-surface'] as const) {
    it(`is the ${slug} thumbnail, path for path`, async () => {
      const { make } = await import(`../components/thumbs/minis/${slug}.ts`)
      const mini = make(null as unknown as SVGSVGElement)
      const r = recorder()
      // As the page's loop does: draw a frame, then ask whether it can be shown.
      let i = 0
      do {
        r.clear()
        mini.draw(r.g, 1000, 600, i / 30, i ? 1 / 30 : 0, PAL)
      } while (!mini.ready() && ++i < 2000)
      expect(mini.ready()).toBe(true)
      const t = thumbFor(slug)!
      expect(r.strokes.filter((s) => s.style === 'R').map((s) => ints(s.pts))).toEqual(t.context)
      expect(r.strokes.filter((s) => s.style === 'I').map((s) => ints(s.pts))).toEqual(t.claim)
    }, 30_000)
  }
})
