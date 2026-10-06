import { describe, expect, it } from 'vitest'
import { histLift } from '@/lib/futures/histLift'
import { HIST, binWidth } from '@/lib/futures/mc'
import { HLEN, HX0, LABELS, priceOfY, wy } from '@/lib/futures/world'

/**
 * The histogram's name and price hang at the end of a full-length bar near the top of the price range. Pushed to a
 * high volatility or strike, the payoff bars there grow to full length under them; the words rise just clear of the
 * bars, never above the stage, and not at all at the figure's own volatility.
 */

// A flat view: 250 px per world unit across, 400 px per world unit up, the point 120 px below the stage's top.
const [x0, y0] = LABELS.hist.at
const toCss = (x: number, y: number) => [300 + (x - HX0) * 250, 120 - (y - y0) * 400] as const
const at = (price: number) => Math.floor((price - HIST.lo) / binWidth)
const W = 180, H = 36

describe('the histogram label lift', () => {
  it('stays put when no bar reaches under the words', () => {
    // Long bars low in the range, short ones near the top: the figure at its own volatility.
    const len = (b: number) => (b < at(160) ? 1 : 0.05)
    expect(histLift(toCss, len, W, H)).toBe(0)
  })

  it('lifts the words clear of a full-length bar that has grown under them', () => {
    const top = at(priceOfY(y0) - 4)
    const len = (b: number) => (b === top ? 1 : 0)
    const lift = histLift(toCss, len, W, H)
    expect(lift).toBeGreaterThan(0)
    // The block's foot now stands above the bar's top (front face; the slab's back is flat in this view).
    const foot = toCss(x0, y0 + lift)[1] + H
    expect(foot).toBeLessThanOrEqual(toCss(HX0 + HLEN, wy(HIST.lo + (top + 1) * binWidth))[1] + 1e-6)
  })

  it('never lifts the words past the stage’s top', () => {
    // The point 40 px under the top: clearing the topmost bar would take the words off the stage.
    const high = (x: number, y: number) => [300 + (x - HX0) * 250, 40 - (y - y0) * 400] as const
    const lift = histLift(high, () => 1, W, H)
    expect(high(x0, y0 + lift)[1]).toBeCloseTo(4, 6)
  })
})
