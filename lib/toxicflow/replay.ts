import replayJson from '@/content/data/toxic-flow/replay_window.json'
import type { Replay } from './data'
import type { ReplayData, ReplayHead, ReplayStrategy } from './replayShape'

export type { ReplayData, ReplayHead, ReplayStrategy } from './replayShape'

// The minute itself, imported here and not through ./data, so Fig. 1's lazily loaded chunk carries this file alone and
// never the study's whole bundle.
const replay = replayJson as unknown as Replay

/**
 * The replay minute in the shape Fig. 1 draws it: prices in ticks above the lowest price the minute shows, one row per
 * 100 ms decision step, from replay_window.json.
 */

const ORDER = ['B1', 'B3', 'F'] as const

/** The markout horizon Fig. 1 shows, in ms: the shortest of the study's three (1 s, 10 s, 60 s). */
export const MARKOUT_MS = 1000

/**
 * A fill's markout, as PREREGISTRATION.md section 6 defines it: 10,000 × side × (mid(t + h) − p) / p, side +1 for a buy,
 * t the fill's exchange time, and mid(t) the mid at the last decision step at or before t on the local clock. Null when
 * t + h is past the minute's last step, whose mid this window does not hold.
 */
export function markout(r: Replay, exchMs: number, price: number, side: 1 | -1, h = MARKOUT_MS): number | null {
  const at = exchMs + h
  const last = r.book[r.book.length - 1]!
  if (at > last.t_ms + r.step_ms) return null
  let k = -1
  for (let n = 0; n < r.book.length && r.book[n]!.t_ms <= at; n++) k = n
  if (k < 0) return null
  const s = r.book[k]!
  const mid = (s.bids[0]![0]! + s.asks[0]![0]!) / 2
  return (1e4 * side * (mid - price)) / price
}

let built: ReplayData | null = null

/** The minute, built once a page: the title's backdrop and Fig. 1 both read it. */
export function replayData(r: Replay = replay): ReplayData {
  if (r === replay) return (built ??= build(r))
  return build(r)
}

function build(r: Replay): ReplayData {
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
      fills: s.fills
        .map((f) => {
          const side = f.side === 'buy' ? 1 : -1
          return [f.exch_t_ms, ticks(f.price), side, markout(r, f.exch_t_ms, f.price, side)] as const
        })
        .sort((a, b) => a[0] - b[0]),
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

export function replayHead(d: ReplayData = replayData()): ReplayHead {
  const { day, from, to, cell, stepMs, levels, span } = d
  return { day, from, to, cell, stepMs, levels, span, strategies: d.strategies.map(({ name, dayBef, dayFills, reproduces }) => ({ name, dayBef, dayFills, reproduces })) }
}

