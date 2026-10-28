/**
 * The shape of Fig. 1's minute (built by ./replay from replay_window.json), and the empty frame the figure shows until
 * it loads. No data here: the client figure imports this file at once and the minute itself only later.
 */

export interface ReplayStrategy {
  readonly name: string
  /** Our bid and ask at each step, in ticks above `base`; null where that side was not quoted. */
  readonly bid: readonly (number | null)[]
  readonly ask: readonly (number | null)[]
  /** Inventory at each step, in order sizes. */
  readonly q: readonly number[]
  /**
   * Simulated fills: exchange time (ms into the minute), price in ticks, +1 our bid filled (we bought), −1 our ask, and
   * the 1 s markout in bp by the study's own rule (PREREGISTRATION.md, section 6), or null where its mid falls past the
   * minute.
   */
  readonly fills: readonly (readonly [number, number, number, number | null])[]
  /** Steps where a side was pulled: start and end (ms), +1 the bid, −1 the ask. */
  readonly pulls: readonly (readonly [number, number, number])[]
  /** The strategy's whole day, as its committed result has it. */
  readonly dayBef: number
  readonly dayFills: number
  readonly reproduces: string
  readonly p?: number
  readonly holdS?: number
}

export interface ReplayData {
  readonly day: string
  readonly from: string
  readonly to: string
  readonly cell: string
  readonly stepMs: number
  readonly levels: number
  /** The window, in ms. */
  readonly span: number
  /** Tick size in price units, and the price `base` ticks stand for. */
  readonly tick: number
  readonly base: number
  /** The mid's range over the minute, in ticks above base (the strip over the chart). */
  readonly lo: number
  readonly hi: number
  /** The chart's range, in ticks from the mid: every quote of every strategy fits, with room. */
  readonly offLo: number
  readonly offHi: number
  /** Step times, ms into the minute (local clock). */
  readonly t: readonly number[]
  /** The book at each step: its levels as [ticks, quantity], best first. */
  readonly bids: readonly (readonly (readonly [number, number])[])[]
  readonly asks: readonly (readonly (readonly [number, number])[])[]
  /** Prints: exchange time (ms), ticks, quantity, +1 buyer-initiated, −1 seller-initiated. */
  readonly trades: readonly (readonly [number, number, number, number])[]
  readonly lamB: readonly number[]
  readonly lamS: readonly number[]
  readonly strategies: readonly ReplayStrategy[]
}

/** What Fig. 1 needs before the minute arrives: its frame, its words and its strategies' whole days. */
export type ReplayHead = Pick<ReplayData, 'day' | 'from' | 'to' | 'cell' | 'stepMs' | 'levels' | 'span'> & {
  readonly strategies: readonly Pick<ReplayStrategy, 'name' | 'dayBef' | 'dayFills' | 'reproduces'>[]
}

/** A minute with nothing in it, the shape of the real one: the figure's frame holds its size while the data loads. */
export function emptyReplay(h: ReplayHead): ReplayData {
  return {
    ...h,
    tick: 1,
    base: 0,
    lo: 0,
    hi: 1,
    offLo: -1,
    offHi: 1,
    t: [0],
    bids: [[[0, 0]]],
    asks: [[[1, 0]]],
    trades: [],
    lamB: [0],
    lamS: [0],
    strategies: h.strategies.map((s) => ({ ...s, bid: [null], ask: [null], q: [0], fills: [], pulls: [] })),
  }
}
