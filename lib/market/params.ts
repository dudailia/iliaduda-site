import type { BookParams } from './book'
import type { HawkesParams } from './hawkes'

/**
 * The one market's parameters: synthetic, set by hand, and calibrated so its
 * calm regime is a busy stock (tests/market-calibration.test.ts pins it over
 * ten seeds). Every view on the site draws this market.
 *
 * Event types, in order: limit buy, limit sell, market buy, market sell,
 * cancel bid, cancel ask. The excitation encodes three well-documented
 * regularities of order flow: market orders cluster (a buy makes another buy
 * likelier), a market order is followed by liquidity refilling the side it
 * ate, and a new limit order is often soon cancelled.
 */

export const HAWKES: HawkesParams = {
  // A busy stock: about 300 events a second in all, most of them limit orders and cancels, a dozen market orders.
  mu: [46.2, 46.2, 6.3, 6.3, 27.3, 27.3],
  //        LB    LS    MB    MS    CB    CA      ← source of the excitation
  jump: [
    [0.6, 0.0, 0.3, 0.9, 0.3, 0.0], // LB
    [0.0, 0.6, 0.9, 0.3, 0.0, 0.3], // LS
    [0.0, 0.0, 0.7, 0.1, 0.0, 0.2], // MB
    [0.0, 0.0, 0.1, 0.7, 0.2, 0.0], // MS
    [0.8, 0.0, 0.0, 0.3, 0.3, 0.0], // CB
    [0.0, 0.8, 0.3, 0.0, 0.0, 0.3], // CA
  ],
  decay: [3, 3, 2, 2, 3, 3],
}

export const BOOK: BookParams = {
  // Deep enough at the touch that the mid moves about a tick a second: 20–30% a year at $100.
  limitSize: 12,
  marketSize: 6,
  gamma: 0.9,
  reach: 60,
  improve: 0.35,
  cancelLo: 0.25,
  cancelHi: 0.7,
}

export const SEED = 20260925

export const MARKET: { readonly hawkes: HawkesParams; readonly book: BookParams } = { hawkes: HAWKES, book: BOOK }
