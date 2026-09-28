import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { HALF, LEVELS } from '../lib/market/flow'
import { bookFrame, bookSvg, fanFrame, fanSvg, ladderSvg, marketFrame, maskByte, SHOCK_FRAME_S } from '../lib/market/poster'
import { depthTone, WINDOW } from '../lib/market/views'

/**
 * /market's still frames (lib/market/poster.ts): drawn at build from the seeded market at the moment the live figure
 * starts from, and a second after a shock there. The heat strip's mask carries the book's depth cell for cell, as the
 * live strip tones it; the ladder and the fan are the market's; and the shocked frame is the moment it says.
 */

/** The pixels of the heat strip's mask: its PNG, each row's filter undone. */
function mask(svg: string) {
  const b64 = /data:image\/png;base64,([^"]+)"/.exec(svg)![1]!
  const png = Buffer.from(b64, 'base64')
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20)
  const raw = inflateSync(png.subarray(41, 41 + png.readUInt32BE(33)))
  const bpp = 2, stride = 1 + w * bpp
  const out = new Uint8Array(w * h * bpp)
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }
  for (let y = 0; y < h; y++) {
    const f = raw[y * stride]!
    for (let i = 0; i < w * bpp; i++) {
      const x = raw[y * stride + 1 + i]!
      const a = i >= bpp ? out[y * w * bpp + i - bpp]! : 0
      const b = y > 0 ? out[(y - 1) * w * bpp + i]! : 0
      const c = y > 0 && i >= bpp ? out[(y - 1) * w * bpp + i - bpp]! : 0
      out[y * w * bpp + i] = (x + (f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c))) & 255
    }
  }
  return { w, h, at: (x: number, y: number) => out[(y * w + x) * 2 + 1]! }
}

describe('the still frames of /market', () => {
  it('tone every cell of the heat strip by the book’s depth there, as the live strip does', () => {
    const { m } = marketFrame()
    const f = m.flow
    const { base } = bookFrame()
    const img = mask(bookSvg())
    expect([img.w, img.h]).toEqual([256, 2 * WINDOW.half + 1])
    // Its tones are the live strip's, to within half a step of 4 of 255.
    for (let d = 0; d < 3000; d += 13) expect(Math.abs(maskByte(d) / 255 - depthTone(d))).toBeLessThanOrEqual(2 / 255 + 1e-12)
    const top = base + WINDOW.half
    for (const c of [0, 64, 128, 200, 255])
      for (let y = 0; y < img.h; y += 6) {
        const r = f.row(255 - c)
        const j = top - y - (f.centre[r]! - HALF)
        const d = j >= 0 && j < LEVELS ? Math.abs(f.depth[r * LEVELS + j]!) : 0
        expect(img.at(c, y), `column ${c}, row ${y}`).toBe(maskByte(d))
      }
  })

  it('draw the book at now and the fan as the market has them, with their words where they fall', () => {
    const { m, fan } = marketFrame()
    expect(ladderSvg()).toContain('<rect x="6"')
    const f = fanFrame()
    expect(f.ticks.map((t) => t.d)).toEqual([50, 100, 200])
    expect(f.lo).toBeCloseTo(fan.band(0, 64) * m.flow.book.mid * 0.01, 9)
    for (const t of f.ticks) expect(t.y).toBeGreaterThan(0)
    for (const t of bookFrame().ticks) expect(t.y >= 0.08 && t.y <= 0.92).toBe(true)
    expect(fanSvg()).toMatch(/<polygon class="w"/)
  })

  it('show the shock a second after it lands: the same market, its stress high, its price lower, its volatility up', () => {
    const calm = marketFrame('calm').m, shocked = marketFrame('shock').m
    expect(SHOCK_FRAME_S).toBe(1)
    expect(shocked.t - calm.t).toBeCloseTo(SHOCK_FRAME_S, 9)
    expect(shocked.log).toHaveLength(1)
    expect(shocked.stress).toBeGreaterThan(0.8)
    expect(shocked.flow.book.mid).toBeLessThan(calm.flow.book.mid)
    expect(shocked.sigma).toBeGreaterThan(calm.sigma * 1.5)
  })
})
