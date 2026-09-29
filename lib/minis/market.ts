import { MODEL } from '../futures/mc'
import { CALM, iv, type Params } from '../surface/ssvi'
import { apply, camera, EXPIRY_TICKS, FRAMES, kOfU, mvp, STRIKE_TICKS, tOfV, wx, wy, wz } from '../surface/view'
import { TH, TW, whole, type Shape } from './shape'

/** The row's half-height in log price: a year's 5th–95th at the calm market's volatility (the home figure's σ), and a quarter more. */
const REACH = 1.645 * MODEL.sigma * 1.25

/** What /market's miniature reads of the market: its price by row, and its futures and surface now. */
export interface MarketSource {
  /** The mid in ticks of the row `age` rows back, or undefined before the first. */
  mid(age: number): number | undefined
  /** The price now, in ticks. */
  readonly now: number
  /** The fan's `b`-th percentile at step `j` (0 to 64), and path `i`'s price at step `j`, as multiples of the price now. */
  band(b: number, j: number): number
  strand(i: number, j: number): number
  readonly surface: Params
  /** Where the surface is in its sway, −1 to 1, as the figure's drift turns it (0 on the thumbnail). */
  readonly sway?: number
}

/**
 * /market's Fig. 1 as it is laid out: the market's vol surface above, through the surface's own camera, and under it
 * the book's price over its last twenty seconds beside a year of its futures. The one-month smile and the price running
 * into the year's median are the claim; the other smiles, the strike lines, the fan's 5th–95th and four of its paths
 * the context. At a
 * thumbnail's size (9rem) a dozen points a line draw it.
 */
export function marketShape(s: MarketSource): Shape {
  // The surface through its camera, fitted to the top 56% of the box with a margin, keeping its proportions.
  const at0 = mvp('wide', camera('wide'))
  const turned = s.sway ? mvp('wide', camera('wide', s.sway)) : at0
  const proj = (p: Params, k: number, T: number, mv = turned) => {
    const q = apply(mv, wx(k), wy(iv(p, k, T)), wz(T))
    // Clip space runs −1 to 1 both ways over a frame 1.62 times as wide as it is tall: in the frame's own proportions.
    return [(q[0] / q[3]) * FRAMES.wide.aspect, -q[1] / q[3]] as const
  }
  const grid = (p: Params, mv = turned) => ({
    smiles: EXPIRY_TICKS.map(([T]) => Array.from({ length: 13 }, (_, i) => proj(p, kOfU(i / 12), T, mv))),
    lines: STRIKE_TICKS.map((K) => Array.from({ length: 9 }, (_, j) => proj(p, Math.log(K), tOfV(j / 8), mv))),
  })
  const { smiles, lines } = grid(s.surface)
  // Fitted to the calm surface's extent, unturned, so a shock lifts the surface within the frame and a sway turns it,
  // rather than either rescaling it.
  const calm = grid(CALM, at0)
  const xs = [...calm.smiles, ...calm.lines].flat()
  const x0 = Math.min(...xs.map((p) => p[0])), x1 = Math.max(...xs.map((p) => p[0]))
  const y0s = Math.min(...xs.map((p) => p[1])), y1s = Math.max(...xs.map((p) => p[1]))
  const box = { l: 40, t: 16, w: TW - 80, h: TH * 0.56 }
  const k = Math.min(box.w / (x1 - x0), box.h / (y1s - y0s))
  const ox = box.l + (box.w - (x1 - x0) * k) / 2, oy = box.t + (box.h - (y1s - y0s) * k) / 2
  const fit = (pts: readonly (readonly [number, number])[]) => whole(pts.map(([x, y]) => [ox + (x - x0) * k, oy + (y - y0s) * k] as const))
  const [first, ...rest] = smiles
  // The row under it: the book's price on the left, the year from now on the right, its 5th–95th filling the row.
  const y0 = TH * 0.64, rh = TH - y0, split = TW * 0.56, gap = 24
  const mids: number[] = []
  for (let a = 239; a >= 0; a -= 5) {
    const v = s.mid(a)
    if (v !== undefined) mids.push(v)
  }
  const lo = Math.min(...mids) - 6, hi = Math.max(...mids) + 6
  const midY = (v: number) => y0 + rh / 2 + ((v - s.now) / (hi - lo)) * -rh * 0.8
  const past = whole(mids.map((v, i) => [(i / Math.max(1, mids.length - 1)) * split, midY(v)] as const))
  // A fixed scale (REACH), so the futures widen as the volatility rises.
  const yr = (v: number) => y0 + rh / 2 - (Math.log(v) / REACH) * (rh / 2)
  const x = (j: number) => split + gap + (j / 64) * (TW - split - gap)
  const band = (b: number) => whole(Array.from({ length: 17 }, (_, j) => [x(j * 4), yr(s.band(b, j * 4))] as const))
  const strand = (i: number) => whole(Array.from({ length: 17 }, (_, n) => [x(n * 4), yr(s.strand(i, n * 4))] as const))
  return {
    context: [...rest.map(fit), ...lines.map(fit), band(0), band(4), ...Array.from({ length: 4 }, (_, i) => strand(i * 12))],
    // The claim: the one-month smile, and the price running into the year's median.
    claim: [fit(first!), past, band(2)],
  }
}
