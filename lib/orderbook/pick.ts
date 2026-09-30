import { clipSegment } from '../m4'
import { apply, DX, DZ, H, XW, Z_NOW, height, type M4 } from './view'

/**
 * Reading the terrain by pointing at it: the eye's ray through a point of the
 * picture, marched to where it first meets the terrain. The live figure picks
 * through its own camera (components/figures/orderbook/renderer.ts) and the
 * still frame through its poster's (lib/orderbook/poster.ts), so a tap reads
 * either (tests/orderbook-pick.test.ts).
 */

/** A reading point: a price level and a row. */
export interface KeyProbe {
  /** Ticks from the window's centre. */
  dp: number
  /** Rows before the newest. */
  age: number
}

/** The terrain at one moment: the price it is centred on, how far into its newest row, how many rows, and its depth. */
export interface Terrain {
  centre: number
  /** How far the newest row is into its snapshot interval, in rows. */
  frac: number
  rows: number
  /** The shares waiting between the touch and `price`, `age` rows back (negative on the bid side). */
  depth(age: number, price: number): number
}

/** The terrain's height under (x, z), between the rows and levels either side; null off it. */
export function heightAt(t: Terrain, x: number, z: number): number | null {
  if (Math.abs(x) > XW) return null
  const pf = x / DX + t.centre
  const af = (Z_NOW - z) / DZ - t.frac
  if (af < 0 || af > t.rows - 1) return null
  const p0 = Math.floor(pf), a0 = Math.floor(af)
  const fp = pf - p0, fa = af - a0
  const a1 = Math.min(a0 + 1, t.rows - 1)
  const h = (a: number, p: number) => height(t.depth(a, p))
  const near = h(a0, p0) * (1 - fp) + h(a0, p0 + 1) * fp
  const far = h(a1, p0) * (1 - fp) + h(a1, p0 + 1) * fp
  return near * (1 - fa) + far * fa
}

/** The level and row under a spot of the picture, in normalised device coordinates of the projection `inv` inverts. */
export function pickTerrain(inv: M4, nx: number, ny: number, t: Terrain): KeyProbe | null {
  const a = apply(inv, nx, ny, -1), b = apply(inv, nx, ny, 1)
  const P0 = [a[0] / a[3], a[1] / a[3], a[2] / a[3]] as const, P1 = [b[0] / b[3], b[1] / b[3], b[2] / b[3]] as const
  // Only the stretch of the ray inside the box the terrain stands in is marched, finely: the rows are a hundredth of
  // a unit apart, and the eye's ray is tens of units long. The box stands three reference heights tall, 3,800 shares
  // waiting between the touch and a level: over twice the most the seeded market builds in ten simulated minutes
  // (1,666), where 1.6 heights, as the live figure once had it, was under it.
  const span = clipSegment(P0, P1, [-XW, 0, Z_NOW - (t.rows - 1 + t.frac) * DZ], [XW, H * 3, Z_NOW - t.frac * DZ])
  if (!span) return null
  const at = (s: number) => [P0[0] + (P1[0] - P0[0]) * s, P0[1] + (P1[1] - P0[1]) * s, P0[2] + (P1[2] - P0[2]) * s] as const
  const above = (s: number) => {
    const p = at(s)
    const h = heightAt(t, Math.max(-XW, Math.min(XW, p[0])), p[2])
    return h === null ? null : p[1] - h
  }
  const probe = (p: readonly [number, number, number]): KeyProbe => {
    const price = Math.round(p[0] / DX + t.centre)
    const age = Math.max(0, Math.min(t.rows - 1, Math.round((Z_NOW - p[2]) / DZ - t.frac)))
    return { dp: price - Math.round(t.centre), age }
  }
  const [s0, s1] = span
  const steps = 400
  let prevS = s0, prev = above(s0)
  // Entering the box already under the terrain is entering through its front edge: the point read is where it came in.
  if (prev !== null && prev <= 0) return probe(at(s0))
  for (let i = 1; i <= steps; i++) {
    const s = s0 + ((s1 - s0) * i) / steps
    const d = above(s)
    if (d !== null && prev !== null && prev > 0 && d <= 0) {
      let lo = prevS, hi = s
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2
        const dm = above(mid)
        if (dm !== null && dm > 0) lo = mid
        else hi = mid
      }
      return probe(at((lo + hi) / 2))
    }
    prev = d
    prevS = s
  }
  return null
}
