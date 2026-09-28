import { TH, TW, whole, type Shape } from './shape'

/** What the order book's miniature reads of a flow (lib/market/flow.ts). */
export interface BookSource {
  row(age: number): number
  readonly centre: ArrayLike<number>
  depthAt(r: number, price: number): number
}

/**
 * /order-book's Fig. 1 as a joy plot: five older ridges higher up in the rule colour, the newest in indigo, each the
 * cumulative depth outward from the touch across the 128 ticks the figure shows.
 */
export function orderBookShape(f: BookSource): Shape {
  const ridge = (age: number, lift: number) => {
    const r = f.row(age)
    const c = f.centre[r]!
    const pts: [number, number][] = []
    for (let j = -64; j <= 64; j += 4) {
      const h = Math.sqrt(Math.abs(f.depthAt(r, c + j)) / 1400)
      pts.push([((j + 64) / 128) * TW, TH - 40 - lift - Math.min(1, h) * 300])
    }
    return whole(pts)
  }
  const ages = [200, 160, 120, 80, 40]
  return { context: ages.map((a, i) => ridge(a, (ages.length - i) * 40)), claim: [ridge(0, 0)] }
}
