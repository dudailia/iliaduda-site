import { replay, type Replay } from './data'

/**
 * The replay minute in the shape Fig. 1 draws it: prices in ticks above the lowest price the minute shows, one row per
 * 100 ms decision step. Built on the server from replay_window.json; the browser gets these arrays and nothing else.
 */

export interface ReplayStrategy {
  readonly name: string
  /** Our bid and ask at each step, in ticks above `base`; null where that side was not quoted. */
  readonly bid: readonly (number | null)[]
  readonly ask: readonly (number | null)[]
  /** Inventory at each step, in order sizes. */
  readonly q: readonly number[]
  /** Simulated fills: exchange time (ms into the minute), price in ticks, +1 our bid filled (we bought), −1 our ask. */
  readonly fills: readonly (readonly [number, number, number])[]
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

const ORDER = ['B1', 'B3', 'F'] as const

export function replayData(r: Replay = replay): ReplayData {
  // The tick is the narrowest spread the minute shows: the book is one tick wide whenever it is tight.
  const spreads = r.book.map((s) => s.asks[0]![0]! - s.bids[0]![0]!)
  const tick = Math.round(Math.min(...spreads) * 1e6) / 1e6
  const prices = r.book.flatMap((s) => [...s.bids, ...s.asks].map((l) => l[0]!))
  const base = Math.min(...prices)
  const ticks = (p: number) => Math.round((p - base) / tick)
  const size = r.strategies.B1!.fills[0]?.qty ?? 1

  const strategies = ORDER.filter((k) => r.strategies[k]).map((k): ReplayStrategy => {
    const s = r.strategies[k]!
    return {
      name: k,
      bid: s.quotes.map((q) => (q.bid == null ? null : ticks(q.bid))),
      ask: s.quotes.map((q) => (q.ask == null ? null : ticks(q.ask))),
      q: s.quotes.map((q) => Math.round(q.position / size)),
      fills: s.fills.map((f) => [f.exch_t_ms, ticks(f.price), f.side === 'buy' ? 1 : -1] as const).sort((a, b) => a[0] - b[0]),
      pulls: s.pulls.map((p) => [p.start_ms, p.end_ms, p.side === 'bid' ? 1 : -1] as const),
      dayBef: s.day_result.break_even_fee_bps,
      dayFills: s.day_result.fills,
      reproduces: s.day_result.reproduces,
      ...(typeof s.params.p === 'number' ? { p: s.params.p } : {}),
      ...(typeof s.params.hold_s === 'number' ? { holdS: s.params.hold_s } : {}),
    }
  })

  // The chart is drawn in ticks from the mid, where a quote's place against the touch shows; the mid itself, and so a
  // sweep that moves it far, goes in the strip over it.
  const mids = r.book.map((s) => (ticks(s.bids[0]![0]!) + ticks(s.asks[0]![0]!)) / 2)
  const offs = strategies.flatMap((s) => [...s.bid, ...s.ask].map((v, n) => (v == null ? null : v - mids[n % mids.length]!)))
  const reach = Math.max(...offs.filter((v): v is number => v != null).map(Math.abs)) + 1.5
  const [from, to] = r.window_utc
  return {
    day: r.day,
    from,
    to,
    cell: r.cell,
    stepMs: r.step_ms,
    levels: r.book_levels,
    span: (Date.parse(`2000-01-01T${to}Z`) - Date.parse(`2000-01-01T${from}Z`)),
    tick,
    base,
    lo: Math.min(...mids),
    hi: Math.max(...mids),
    offLo: -reach,
    offHi: reach,
    t: r.book.map((s) => s.t_ms),
    bids: r.book.map((s) => s.bids.map((l) => [ticks(l[0]!), l[1]!] as const)),
    asks: r.book.map((s) => s.asks.map((l) => [ticks(l[0]!), l[1]!] as const)),
    trades: r.trades.map((x) => [x.t_ms, ticks(x.price), x.qty, x.side === 'buy' ? 1 : -1] as const),
    lamB: r.signals.hawkes_lambda_b,
    lamS: r.signals.hawkes_lambda_s,
    strategies,
  }
}
