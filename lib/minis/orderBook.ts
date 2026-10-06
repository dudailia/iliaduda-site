import { HZ } from '../market/flow'
import { TH, TW, whole, type Shape } from './shape'

/** What the order book's miniature reads of a flow (lib/market/flow.ts). */
export interface BookSource {
  row(age: number): number
  readonly centre: ArrayLike<number>
  /** Each row's mid in ticks (fractional), and the simulated time it was written. */
  readonly mids: ArrayLike<number>
  readonly times: ArrayLike<number>
  /** The flow's simulated time now. */
  readonly t: number
  depthAt(r: number, price: number): number
}

/**
 * /order-book's Fig. 1 as a joy plot: five older ridges higher up in the rule color, the newest in indigo, each the
 * cumulative depth outward from the touch across the 128 ticks the figure shows. Each ridge is drawn the fraction of a
 * row the market is past its newest row, from the row before toward its own, and about its row's own mid, so the
 * ridges glide as the figure's terrain does rather than stepping twelve times a second.
 */
export function orderBookShape(f: BookSource): Shape {
  const newest = f.row(0)
  const u = newest < 0 ? 1 : Math.min(1, Math.max(0, (f.t - f.times[newest]!) * HZ))
  const profile = (r: number, lift: number) => {
    const c = f.centre[r]!, m = f.mids[r]!
    const out: number[] = []
    for (let j = -64; j <= 64; j += 4) {
      const h = Math.sqrt(Math.abs(f.depthAt(r, c + j)) / 1400)
      out.push(((j + c - m + 64) / 128) * TW, TH - 40 - lift - Math.min(1, h) * 300)
    }
    return out
  }
  const ridge = (age: number, lift: number) => {
    const a = profile(f.row(age), lift)
    const older = f.row(age + 1)
    const b = older < 0 ? a : profile(older, lift)
    const pts: [number, number][] = []
    for (let i = 0; i < a.length; i += 2) pts.push([b[i]! + (a[i]! - b[i]!) * u, b[i + 1]! + (a[i + 1]! - b[i + 1]!) * u])
    return whole(pts)
  }
  const ages = [200, 160, 120, 80, 40]
  return { context: ages.map((a, i) => ridge(a, (ages.length - i) * 40)), claim: [ridge(0, 0)] }
}
