import { describe, expect, it } from 'vitest'
import { DZ, H, REST, SWAY, XW, Z_NOW, apply, fit, lens, mul, perspective, restPitch, view } from '@/lib/orderbook/view'

/**
 * The order book's resting camera: on a laptop's column the whole valley,
 * centred, with a hairline of paper to spare for the drift; on a phone's tall
 * frame the valley's middle, looking down it, so the history climbs the
 * frame. Either way the terrain uses the stage's height, not just its width.
 */

/** The walls at the valley's ends stand about 1.16 H at the median over ten calm minutes: the terrain as it usually is. */
const ENDS = 1.16 * H

function extent(aspect: number) {
  const c = fit(REST.yaw, restPitch(aspect), aspect)
  const m = mul(perspective(aspect, lens(aspect)), view(c))
  const P = (x: number, y: number, z: number) => {
    const q = apply(m, x, y, z)
    return [q[0] / q[3], q[1] / q[3]] as const
  }
  const xs: number[] = [], ys: number[] = []
  for (const x of [-XW, XW]) for (const z of [Z_NOW, Z_NOW - 2.2]) for (const y of [0, ENDS]) {
    const p = P(x, y, z)
    xs.push(p[0])
    ys.push(p[1])
  }
  // Ten seconds of history, measured along the valley floor, as a share of the frame's height.
  const climb = (P(0, 0, Z_NOW - 120 * DZ)[1] - P(0, 0, Z_NOW)[1]) / 2
  return { x0: Math.min(...xs), x1: Math.max(...xs), span: (Math.max(...ys) - Math.min(...ys)) / 2, climb }
}

describe('the order book at rest', () => {
  it.each([1.0, 1.12, 1.3, 1.6])('shows a laptop’s whole valley centred, with paper to spare (aspect %s)', (aspect) => {
    const e = extent(aspect)
    expect(Math.abs(e.x0 + e.x1)).toBeLessThan(0.03)
    expect(Math.max(-e.x0, e.x1)).toBeLessThanOrEqual(0.935)
  })

  it.each([0.6, 0.66, 0.8, 1.12, 1.3])('uses the stage’s height as well as its width (aspect %s)', (aspect) => {
    expect(extent(aspect).span).toBeGreaterThanOrEqual(0.6)
  })

  it.each([0.6, 0.66, 0.8])('climbs a phone’s tall frame with the history (aspect %s)', (aspect) => {
    expect(extent(aspect).climb).toBeGreaterThanOrEqual(0.3)
  })

  it.each([1.0, 1.12, 1.3, 1.6])('keeps a laptop’s valley on its column through the whole drift and lean (aspect %s)', (aspect) => {
    const c = fit(REST.yaw, restPitch(aspect), aspect)
    const s = SWAY.drift + SWAY.yaw
    for (const dy of [-s, s])
      for (const dp of [-SWAY.pitch, SWAY.pitch]) {
        const m = mul(perspective(aspect, lens(aspect)), view({ ...c, yaw: c.yaw + dy, pitch: c.pitch + dp }))
        // The ends at their 95th-percentile height, 1.38 H.
        for (const x of [-XW, XW]) for (const z of [Z_NOW, Z_NOW - 2.2]) for (const y of [0, 1.38 * H]) {
          const q = apply(m, x, y, z)
          expect(Math.abs(q[0] / q[3])).toBeLessThanOrEqual(1)
          expect(Math.abs(q[1] / q[3])).toBeLessThanOrEqual(1)
        }
      }
  })
})
