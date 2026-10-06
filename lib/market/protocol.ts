/**
 * What the page and /market's worker say to each other (lib/market/market.worker.ts), and the layout of a frame:
 * the market as it is when the page asks, the order book at "now", and the rows and trades since the page's last
 * frame, written into one ArrayBuffer the page lends the worker and gets back, transferred both ways and never
 * copied (no SharedArrayBuffer, so no cross-origin isolation). The page reads a frame in place.
 *
 * Nothing here runs the market: the page imports this and never the engine, which stays in the worker.
 */

/** The protocol's version, and the flow's layout and clock (lib/market/flow.ts; tests/market-protocol.test.ts holds them equal). */
export const PROTOCOL = { version: 2, levels: 160, half: 80, quanta: 60, hz: 12 } as const

/** Rows and trades a frame can carry: the flow's whole ring (twenty-one seconds) and its whole tape. */
export const MAX_ROWS = 256
export const MAX_TRADES = 1024

/** The header's slots, in order. */
export const H = {
  version: 0,
  seq: 1,
  /** Simulated seconds, and whole quanta run. */
  t: 2,
  quanta: 3,
  /** The book, in ticks. */
  mid: 4,
  spread: 5,
  bestBid: 6,
  bestAsk: 7,
  /** Realised volatility (annualized), stress (0 to 1), selling pressure (× stationary), shares at the thinner touch. */
  sigma: 8,
  stress: 9,
  pressure: 10,
  touch: 11,
  /** The liquidity shock (lib/market/shock.ts): its load, absorbing (1) or not, shocks taken and the last one's quantum. */
  load: 12,
  absorbing: 13,
  shocks: 14,
  shockQ: 15,
  /** Over the last ten simulated seconds: events a second, and the stationary rate; trades and shares. */
  rate: 16,
  expected: 17,
  trades: 18,
  shares: 19,
  /** The worker's own: futures drawn a second of its own time, its busy share, wall seconds the market was held, simulated seconds a wall second. */
  paths: 20,
  busy: 21,
  held: 22,
  speed: 23,
  /** The newest fan's number (its own message), and whether the reader has paused the market. */
  fanSeq: 24,
  paused: 25,
  /** Rows written in all; the tick at the ladder's middle. */
  written: 26,
  centre: 27,
  /** What this frame carries: rows and trades; trades and rows it had to leave out. */
  nRows: 28,
  nTrades: 29,
  dropped: 30,
  lostRows: 31,
  /** Times the market has started over (Reset, Replay): the page's copy starts over when it changes. */
  resets: 32,
} as const
export const HEADER = 34

/**
 * Per row: its time, the tick at its middle, mid, best bid, best ask, queues at the two touches, events in it, and
 * the realized volatility and stress when it was written (so a moment read in the book is the market's at that row).
 */
export const ROW_META = 10
const TRADE = 4

const OFF = (() => {
  const header = 0
  const trades = header + HEADER * 8
  const rowMeta = trades + MAX_TRADES * TRADE * 8
  const ladder = rowMeta + MAX_ROWS * ROW_META * 8
  const rows = ladder + PROTOCOL.levels * 4
  const end = rows + MAX_ROWS * PROTOCOL.levels * 4
  return { header, trades, rowMeta, ladder, rows, end }
})()

/** Bytes in a frame, rounded to whole doubles. */
export const FRAME_BYTES = Math.ceil(OFF.end / 8) * 8

/** A frame's parts, as views into its buffer: valid until the buffer goes back to the worker. */
export interface Frame {
  readonly h: Float64Array
  /** Shares waiting at each of the ladder's levels, from `h[H.centre] − half` up: bids at and below the best bid, asks at and above the best ask. */
  readonly ladder: Float32Array
  /** `nRows` rows, oldest first: ROW_META numbers each, and a row's levels in `rows`, laid out as the ladder. */
  readonly rowMeta: Float64Array
  readonly rows: Float32Array
  /** `nTrades` trades, oldest first: time, price in ticks, shares, side (+1 a buyer took the ask, −1 a seller hit the bid). */
  readonly trades: Float64Array
  readonly nRows: number
  readonly nTrades: number
}

/** The views a frame's parts are written through, whole: the worker's side (lib/market/frame.ts). */
export function frameViews(buf: ArrayBuffer) {
  return {
    h: new Float64Array(buf, OFF.header, HEADER),
    trades: new Float64Array(buf, OFF.trades, MAX_TRADES * TRADE),
    rowMeta: new Float64Array(buf, OFF.rowMeta, MAX_ROWS * ROW_META),
    ladder: new Float32Array(buf, OFF.ladder, PROTOCOL.levels),
    rows: new Float32Array(buf, OFF.rows, MAX_ROWS * PROTOCOL.levels),
  }
}

/** A frame, read in place. */
export function readFrame(buf: ArrayBuffer): Frame {
  const v = frameViews(buf)
  const nRows = v.h[H.nRows]!
  const nTrades = v.h[H.nTrades]!
  return {
    h: v.h,
    ladder: v.ladder,
    rowMeta: v.rowMeta.subarray(0, nRows * ROW_META),
    rows: v.rows.subarray(0, nRows * PROTOCOL.levels),
    trades: v.trades.subarray(0, nTrades * TRADE),
    nRows,
    nTrades,
  }
}

/** What the worker does to the market: one of the engine's actions (lib/market/engine.ts). */
export type Act = 'shock'

/** The page to the worker. */
export type ToWorker =
  /** Build the market from `seed` and run it to simulated time `t`. */
  | { kind: 'start'; seed: number; t: number }
  /** A frame at the page's clock `at` (ms), written into `buf`, which comes back in the answer. */
  | { kind: 'frame'; at: number; buf: ArrayBuffer }
  /** An action now, or (with `at`) at the start of the quantum the market reaches at simulated time `at`. */
  | { kind: 'act'; act: Act; at?: number }
  /** Drop an action waiting for its time. */
  | { kind: 'unschedule' }
  | { kind: 'pause' }
  | { kind: 'resume' }
  /** Back to the market as it was at the start. */
  | { kind: 'reset' }
  /** ?debug=1: build the shocked market of lib/market/host.ts (shockedHash) and say its hash. */
  | { kind: 'check'; seed: number; t: number }

/** A fan of futures from the market's price at its volatility (lib/futures/fan.ts), for a price of 1: the page scales it by the mid. */
export interface FanMsg {
  kind: 'fan'
  seq: number
  /** Simulated time it was begun at, and the volatility it was drawn at. */
  t: number
  sigma: number
  /** Its model's rate and step, in years: what the page needs to draw it at another volatility (lib/market/views.ts, fanAt). */
  r: number
  dt: number
  /** The 5th, 25th, 50th, 75th and 95th percentiles at each of the 65 steps, a row a percentile. */
  bands: Float64Array
  /** 48 whole paths, a row a path, today first. */
  strands: Float64Array
  /** The at-the-money call a year out, its standard error, and Black–Scholes. */
  call: { mean: number; se: number; exact: number }
  paths: number
}

/** The worker to the page. */
export type FromWorker =
  /** The market is built: its clock, its hash (lib/market/engine.ts), and its realized volatility then. */
  | { kind: 'ready'; t: number; hash: string; sigma: number }
  | { kind: 'frame'; buf: ArrayBuffer }
  | FanMsg
  | { kind: 'check'; hash: string }
  | { kind: 'error'; message: string }
