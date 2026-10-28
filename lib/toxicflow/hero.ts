import type { ReplayData } from './replayShape'

/**
 * The title's backdrop: the replayed minute's book, one bar for each of its levels at its price, bids to the left of
 * the mid and asks to its right, as tall as the size waiting there on a log scale (the touch holds thousands of times
 * what the levels behind it do, and on a linear or square-root scale they vanish). Data-free: the minute comes in with
 * Fig. 1's chunk.
 */

export interface Book {
  /** Ticks from the mid the backdrop reaches either way. */
  readonly reach: number
  /** The largest size any level holds in the minute, BTC. */
  readonly top: number
  /** The smallest: a level that size draws as a sliver, never as nothing. */
  readonly lot: number
  readonly mids: readonly number[]
}

export function book(d: Pick<ReplayData, 'bids' | 'asks'>): Book {
  const mids = d.bids.map((b, i) => (b[0]![0] + d.asks[i]![0]![0]) / 2)
  let reach = 0
  let top = 0
  let lot = Infinity
  d.bids.forEach((b, i) => {
    for (const [p, q] of [...b, ...d.asks[i]!]) {
      reach = Math.max(reach, Math.abs(p - mids[i]!))
      top = Math.max(top, q)
      if (q > 0) lot = Math.min(lot, q)
    }
  })
  return { reach: Math.ceil(reach + 1), top, lot, mids }
}

/** A level's height, 0 to 1, on the log scale. */
export const height = (q: number, b: Pick<Book, 'top' | 'lot'>) => (q <= 0 ? 0 : Math.log1p(q / b.lot) / Math.log1p(b.top / b.lot))
