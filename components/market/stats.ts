'use client'

/**
 * /market's live rates, as Fig. 1 last measured them, for the figures that report on the market without drawing it
 * (Fig. 2, components/figures/market/Pipeline.tsx): a tiny store, written a few times a second.
 */
export interface MarketRates {
  /** Events a simulated second over the last ten, and the model's stationary rate. */
  rate: number
  expected: number
  /** Frames the page took from the worker in the last wall second. */
  frames: number
  /** Futures the worker draws a second of its own time; its busy share; wall seconds the market was held. */
  paths: number
  busy: number
  held: number
}

let last: MarketRates | null = null
const listeners = new Set<(r: MarketRates) => void>()

export const marketRates = {
  set(r: MarketRates) {
    last = r
    for (const l of listeners) l(r)
  },
  get: () => last,
  subscribe(fn: (r: MarketRates) => void) {
    listeners.add(fn)
    return () => void listeners.delete(fn)
  },
}
