import { Estimator, HIST, MODEL, binWidth, discount, path, terminal } from './mc'
import { HLEN, HX0, PS, X0, X1, px, py, wx, wy } from './world'

/**
 * The still frame: a real frame of the same computation. The first strands
 * of the ensemble, drawn with the same generator the GPU uses, and the
 * terminal histogram of the first 65,536 paths with the price they give.
 * It is what first paint shows, what reduced motion keeps, and what a device
 * without float render targets keeps; so it is kept small — strands at every
 * other step, integer coordinates, relative moves.
 */

export const POSTER_STRANDS = 90
export const POSTER_PATHS = 65_536

export interface Strand {
  d: string
  /** Finishes above the strike: the futures in which the option pays. */
  pays: boolean
}

export interface Bar {
  x: number
  y: number
  w: number
  h: number
  pays: boolean
}

export interface Summary {
  n: number
  mean: number
  se: number
}

/** A bar of what one histogram bin pays: count × payoff, the claim the figure makes. */
export interface PayBar {
  x: number
  y: number
  w: number
  h: number
  /** The bin's lower price edge, in dollars. */
  lo: number
}

/** What the page's summary and its screen-reader table need, and what the poster draws. */
export interface Frame {
  stats: Summary
  bars: Bar[]
  /** Paths ending in each bin, and the payoff they sum to, bin by bin. */
  counts: number[]
  payoff: number[]
  payBars: PayBar[]
  /** The distribution as a step outline (poster units): the context behind the claim. */
  outline: string
}

export function strands(sigma: number, K: number, n = POSTER_STRANDS): Strand[] {
  const out: Strand[] = []
  for (let id = 0; id < n; id++) {
    const s = path(id, sigma)
    let d = ''
    let lx = 0, ly = 0
    for (let j = 0; j <= MODEL.steps; j += 2) {
      const x = Math.round(px(wx((j / MODEL.steps) * MODEL.T)))
      const y = Math.round(py(wy(Math.min(Math.max(s[j]!, 1), 400))))
      d += j === 0 ? `M${x} ${y}` : `l${x - lx} ${y - ly}`
      lx = x
      ly = y
    }
    out.push({ d, pays: s[MODEL.steps]! > K })
  }
  return out
}

/** Terminal prices of paths [from, from + n), written into `into`. Chunkable. */
export function fill(into: Float32Array, sigma: number, from: number, n: number) {
  for (let i = from; i < from + n; i++) into[i] = terminal(i, sigma)
}

export function ensemble(sigma: number, n = POSTER_PATHS): Float32Array {
  const t = new Float32Array(n)
  fill(t, sigma, 0, n)
  return t
}

/** Price, histogram, payoff bars and outline for strike K from a set of terminal prices. */
export function summarize(t: Float32Array, K: number, n = t.length): Frame {
  const e = new Estimator(discount())
  const counts = new Float64Array(HIST.bins)
  const pay = new Float64Array(HIST.bins)
  let s = 0, s2 = 0, sS = 0
  for (let i = 0; i < n; i++) {
    const ST = t[i]!
    const p = Math.max(ST - K, 0)
    s += p
    s2 += p * p
    sS += ST
    const b = Math.floor((ST - HIST.lo) / binWidth)
    if (b >= 0 && b < HIST.bins) {
      counts[b]!++
      pay[b]! += p
    }
  }
  e.add(s, s2, sS, n)
  let max = 0, maxPay = 0
  for (let b = 0; b < HIST.bins; b++) {
    max = Math.max(max, counts[b]!)
    maxPay = Math.max(maxPay, pay[b]!)
  }
  const bars: Bar[] = []
  const payBars: PayBar[] = []
  const x = Math.round(px(HX0))
  const top = (lo: number) => Math.round(py(wy(lo + binWidth)) * 10) / 10
  const bottom = (lo: number) => Math.round(py(wy(lo)) * 10) / 10
  for (let b = 0; b < HIST.bins; b++) {
    const c = counts[b]!
    if (!c) continue
    const lo = HIST.lo + b * binWidth
    const y = top(lo)
    const h = Math.round((bottom(lo) - y - 0.8) * 10) / 10
    bars.push({ x, y, w: Math.max(1, Math.round((c / max) * HLEN * PS)), h, pays: lo + binWidth / 2 > K })
    if (pay[b]! > 0) payBars.push({ x, y, w: Math.max(1, Math.round((pay[b]! / maxPay) * HLEN * PS)), h, lo })
  }
  // The outline climbs bin by bin up the price axis, then closes back to the baseline.
  let first = -1, last = -1
  for (let b = 0; b < HIST.bins; b++) {
    if (!counts[b]) continue
    if (first < 0) first = b
    last = b
  }
  let outline = ''
  if (first >= 0) {
    const xr = (b: number) => Math.round((px(HX0) + (counts[b]! / max) * HLEN * PS) * 10) / 10
    outline = `M${x} ${bottom(HIST.lo + first * binWidth)}`
    for (let b = first; b <= last; b++) {
      const lo = HIST.lo + b * binWidth
      outline += `L${xr(b)} ${bottom(lo)}L${xr(b)} ${top(lo)}`
    }
    outline += `L${x} ${top(HIST.lo + last * binWidth)}`
  }
  return { stats: { n, mean: e.mean, se: e.se }, bars, counts: Array.from(counts), payoff: Array.from(pay), payBars, outline }
}

/** What the page ships to the browser: the frame without the count bars, which the finished picture no longer draws. */
export type PosterFrame = Omit<Frame, 'bars'>

/**
 * The histogram in `groups` equal bands of price, for the screen-reader table:
 * each band's share of all the paths, and what the option pays there on average.
 */
export function bands(f: { n: number; counts: readonly number[]; payoff: readonly number[] }, groups = 11): { lo: number; hi: number; share: number; payoff: number }[] {
  const per = Math.ceil(HIST.bins / groups)
  const out: { lo: number; hi: number; share: number; payoff: number }[] = []
  for (let g = 0; g < groups; g++) {
    let c = 0, p = 0
    for (let b = g * per; b < Math.min(HIST.bins, (g + 1) * per); b++) {
      c += f.counts[b]!
      p += f.payoff[b]!
    }
    out.push({ lo: HIST.lo + g * per * binWidth, hi: HIST.lo + Math.min(HIST.bins, (g + 1) * per) * binWidth, share: f.n ? c / f.n : 0, payoff: c ? p / c : 0 })
  }
  return out
}

export function posterData(sigma: number, K: number) {
  return { strands: strands(sigma, K), ...summarize(ensemble(sigma), K) }
}

/** Fixed marks, in poster units. */
export const MARKS = {
  today: { x: Math.round(px(X0)), y: Math.round(py(wy(MODEL.s0))) },
  expiry: { x: Math.round(px(X1)) },
  strikeX0: Math.round(px(X1 - 0.32)),
  strikeX1: Math.round(px(HX0 + HLEN + 0.04)),
  strikeY: (K: number) => Math.round(py(wy(K)) * 10) / 10,
} as const
