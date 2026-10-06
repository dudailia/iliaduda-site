import { BAR_D } from './camera'
import { HIST, binWidth } from './mc'
import { HLEN, HX0, LABELS, wy } from './world'

/**
 * How far (world y) the histogram's name and its price rise above their point, so that no bar runs under them.
 *
 * The words hang right-aligned at the end of a full-length bar, near the top of the price range, where the bars are
 * short at the figure's own volatility. Pushed up (σ 70% and over, or a high strike), the payoff bars there grow to
 * their full length and the words sat on the bars they name. Measured on screen: `toCss` maps a world point to css
 * pixels (y down), `len` is each bin's drawn length (0…1 of HLEN), and the words are a `w` × `h` px block hanging below
 * the point. The rise lifts the block clear of every bar that reaches under its column, and never above the stage's
 * top (4px in, as every label is held), so a label is never held back, and faded, by the stage's edge.
 */
export function histLift(toCss: (x: number, y: number, z: number) => readonly [number, number], len: (bin: number) => number, w: number, h: number): number {
  const [x0, y0] = LABELS.hist.at
  const [ax, ay] = toCss(x0, y0, 0)
  const [, up] = toCss(x0, y0 + 0.1, 0)
  const perY = (ay - up) / 0.1
  if (!(perY > 0) || w <= 0) return 0
  const pad = 6
  let need = 0
  for (let b = 0; b < HIST.bins; b++) {
    const l = len(b)
    if (!(l > 0)) continue
    const x = HX0 + HLEN * l, top = wy(HIST.lo + (b + 1) * binWidth)
    // The bar's end, at its front face and at the back of its slab: whichever stands higher on screen.
    const [fx, fy] = toCss(x, top, 0)
    const [, by] = toCss(x, top, -2 * BAR_D)
    if (fx < ax - w - pad) continue
    need = Math.max(need, ay + h + pad - Math.min(fy, by))
  }
  // A bar's tip a few pixels into the block (the figure's own volatility, the poster's picture) is no cause to move the
  // words: lifted for it, the live words stood 8–10px above the poster's across the hand-over. The lift comes in past
  // 12px and reaches the full clearance by 30px, continuously.
  const T = 12
  const u = Math.min(1, Math.max(0, (need - T) / (1.5 * T)))
  const eased = Math.max(0, need - T) + T * u * u * (3 - 2 * u)
  return Math.min(eased, Math.max(0, ay - 4)) / perY
}
