import { cdf } from '@/lib/bs'
import { HIST, MODEL, binWidth, discount } from './mc'

/**
 * Where the paths end, as the GPU counts it on every device: in fine bins,
 * four to each bin the figure draws, as exact integers. Each path adds one to
 * an eight-bit render target by additive blending, and the counts are carried
 * into 32-bit integers before any byte can overflow, so no float render target
 * is needed; that is what lets a phone count. What a bin pays is then taken at
 * each fine bin's midpoint, which at a quarter of the drawn width is closer to
 * the exact sum than the Monte Carlo error is to the price.
 */

export const FINE_PER = 4
export const FINE = HIST.bins * FINE_PER
export const fineWidth = binWidth / FINE_PER

/** The fine bin a price at expiry falls in, or −1 outside the histogram. The scatter shader does the same sum. */
export function fineBin(s: number): number {
  const b = Math.floor((s - HIST.lo) / fineWidth)
  return b >= 0 && b < FINE ? b : -1
}

const mid = (f: number) => HIST.lo + (f + 0.5) * fineWidth

/** The drawn bins from fine counts: paths ending in each, and what they pay at strike K. */
export function aggregate(fine: ArrayLike<number>, K: number): { counts: number[]; payoff: number[] } {
  const counts = new Array<number>(HIST.bins).fill(0)
  const payoff = new Array<number>(HIST.bins).fill(0)
  for (let f = 0; f < FINE; f++) {
    const c = fine[f]!
    if (!c) continue
    const b = (f / FINE_PER) | 0
    counts[b]! += c
    payoff[b]! += c * Math.max(mid(f) - K, 0)
  }
  return { counts, payoff }
}

/**
 * The call at a strike the GPU has not priced, from the histogram alone:
 * paths past either end are left out, so it is approximate, and the figure
 * says "about".
 */
export function binnedPrice(fine: ArrayLike<number>, K: number): number {
  let n = 0, s = 0
  for (let f = 0; f < FINE; f++) {
    const c = fine[f]!
    n += c
    s += c * Math.max(mid(f) - K, 0)
  }
  return n ? (discount() * s) / n : NaN
}

/**
 * The share of paths that end above the histogram's top, where no bar is drawn. The paths are geometric Brownian motion
 * stepped exactly, so it is the model's own N(d2) at that price, not an estimate: under 0.01% at the figure's own
 * volatility, about 7% at 80%.
 */
export function shareAbove(sigma: number, m = MODEL): number {
  return cdf((Math.log(m.s0 / HIST.hi) + (m.r - 0.5 * sigma * sigma) * m.T) / (sigma * Math.sqrt(m.T)))
}

/** The words for it, at the top of the price axis: shown from half a percent. */
export const aboveWords = (share: number) => `${share < 0.0095 ? (share * 100).toFixed(1) : Math.round(share * 100)}% of paths end above $${HIST.hi}`
export const ABOVE_SHOWN = 0.005
