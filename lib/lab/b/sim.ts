import { Book, CANCEL_ASK, CANCEL_BID, LIMIT_BUY, LIMIT_SELL, MARKET_BUY, MARKET_SELL, type BookParams, type Trade } from './book'
import { Hawkes, stationaryRates, type HawkesParams } from './hawkes'
import { mulberry32 } from './rng'

/**
 * The market the hero draws: a Hawkes process generating order flow into a
 * limit order book, sampled into a ring of snapshots — one row of depth per
 * twelfth of a simulated second — which the renderer streams into a texture
 * and the poster draws as ridgelines.
 *
 * Types, in order: limit buy, limit sell, market buy, market sell, cancel bid,
 * cancel ask. The excitation encodes three well-documented regularities of
 * order flow: market orders cluster (a buy makes another buy likelier), a
 * market order is followed by liquidity refilling the side it ate, and a new
 * limit order is often soon cancelled.
 */

export const HAWKES: HawkesParams = {
  mu: [2.2, 2.2, 0.3, 0.3, 1.3, 1.3],
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
  limitSize: 5,
  marketSize: 6,
  gamma: 0.9,
  reach: 60,
  improve: 0.35,
  cancelLo: 0.25,
  cancelHi: 0.7,
}

export const SEED = 20260925
/** Price in dollars of one tick, and the opening mid. */
export const TICK = 0.01
export const START = 10000
/** Snapshots per simulated second. */
export const HZ = 12
/** Rows kept: 256 / 12 ≈ 21 seconds of history. */
export const ROWS = 256
/** Ticks stored per row, centred on that row's mid. */
export const LEVELS = 160
export const HALF = LEVELS / 2
/** Simulated seconds run before the first row is kept, so the book is in its stationary regime. */
export const BURN = 120
/** The poster is the frame at this simulated time after burn-in: the ring is full. */
export const POSTER_T = BURN + ROWS / HZ + 2
/** Window for the rolling readouts, in rows. */
export const WINDOW = 10 * HZ

const MAX_TRADES = 1024

export interface Stats {
  /** Events per second over the last ten simulated seconds. */
  rate: number
  /** Trades (fills) in the last ten simulated seconds, and the shares in them. */
  trades: number
  shares: number
  mid: number
  spread: number
  bestBid: number
  bestAsk: number
  t: number
}

export class Sim {
  readonly hawkes: Hawkes
  readonly book: Book
  /** (I − B)⁻¹ μ, summed: the stationary event rate the process must converge to. */
  readonly expected: number
  readonly rho: number
  /** Ring of rows. depth: signed cumulative depth (+ ask side, − bid side, 0 inside the spread). */
  readonly depth = new Float32Array(ROWS * LEVELS)
  /** Queue at each stored level (shares), unsigned. */
  readonly queue = new Float32Array(ROWS * LEVELS)
  /** Tick at stored index HALF of each row. */
  readonly centre = new Int32Array(ROWS)
  readonly mids = new Float32Array(ROWS)
  readonly bids = new Int32Array(ROWS)
  readonly asks = new Int32Array(ROWS)
  readonly times = new Float64Array(ROWS)
  /** Events and fills in each row's interval, for the rolling readouts. */
  readonly events = new Uint16Array(ROWS)
  readonly fills = new Uint16Array(ROWS)
  readonly volume = new Uint32Array(ROWS)
  /** Index of the newest row, and how many rows have been written in total. */
  head = -1
  written = 0
  /** Recent trades, newest last. */
  readonly trades: Trade[] = []
  /** Called for every fill as it happens, for sparks. */
  onTrade: ((tr: Trade) => void) | null = null
  private pendingEvents = 0
  private pendingFills = 0
  private pendingVolume = 0
  private nextRow: number

  constructor(seed = SEED) {
    const rng = mulberry32(seed)
    this.hawkes = new Hawkes(HAWKES, rng)
    this.rho = this.hawkes.rho
    this.expected = stationaryRates(HAWKES).reduce((a, b) => a + b, 0)
    this.book = new Book(BOOK, rng, START, (d) => Math.round(4 + 10 * Math.exp(-((d - 6) ** 2) / 60)))
    this.run(BURN, false)
    this.nextRow = BURN + 1 / HZ
  }

  get t() {
    return this.hawkes.t
  }

  private run(tEnd: number, keep: boolean) {
    this.hawkes.run(tEnd, (t, type) => {
      this.book.apply(type, t, keep ? this.trade : undefined)
      if (keep) this.pendingEvents++
    })
  }

  private trade = (tr: Trade) => {
    this.pendingFills++
    this.pendingVolume += tr.size
    this.trades.push(tr)
    if (this.trades.length > MAX_TRADES) this.trades.splice(0, this.trades.length - MAX_TRADES)
    this.onTrade?.(tr)
  }

  /** Advance the clock to `tEnd`, writing a row at every 1/HZ boundary. Cheap: ~15 events a second. */
  advance(tEnd: number): number {
    let rows = 0
    while (this.nextRow <= tEnd) {
      this.run(this.nextRow, true)
      this.snapshot(this.nextRow)
      this.nextRow = BURN + (Math.round((this.nextRow - BURN) * HZ) + 1) / HZ
      rows++
    }
    this.run(tEnd, true)
    return rows
  }

  private snapshot(t: number) {
    const b = this.book
    const r = (this.head = (this.head + 1) % ROWS)
    this.written++
    const c = Math.round(b.mid)
    this.centre[r] = c
    this.mids[r] = b.mid
    this.bids[r] = b.bestBid
    this.asks[r] = b.bestAsk
    this.times[r] = t
    this.events[r] = this.pendingEvents
    this.fills[r] = this.pendingFills
    this.volume[r] = this.pendingVolume
    this.pendingEvents = this.pendingFills = this.pendingVolume = 0
    const o = r * LEVELS
    // Cumulative depth outward from each touch.
    let cum = 0
    for (let price = b.bestAsk; price < c - HALF + LEVELS; price++) {
      const q = b.askAt(price)
      cum += q
      const j = price - c + HALF
      if (j >= 0) {
        this.depth[o + j] = cum
        this.queue[o + j] = q
      }
    }
    cum = 0
    for (let price = b.bestBid; price >= c - HALF; price--) {
      const q = b.bidAt(price)
      cum += q
      const j = price - c + HALF
      if (j < LEVELS) {
        this.depth[o + j] = -cum
        this.queue[o + j] = q
      }
    }
    for (let price = b.bestBid + 1; price < b.bestAsk; price++) {
      const j = price - c + HALF
      if (j >= 0 && j < LEVELS) {
        this.depth[o + j] = 0
        this.queue[o + j] = 0
      }
    }
  }

  /** Ring index of the row `age` rows before the newest, or -1 if not yet written. */
  row(age: number): number {
    if (age < 0 || age >= Math.min(ROWS, this.written)) return -1
    return (((this.head - age) % ROWS) + ROWS) % ROWS
  }

  /** Signed cumulative depth at an absolute tick in a row; clamps past the stored window. */
  depthAt(r: number, price: number): number {
    const j = Math.min(LEVELS - 1, Math.max(0, price - this.centre[r]! + HALF))
    return this.depth[r * LEVELS + j]!
  }
  queueAt(r: number, price: number): number {
    const j = price - this.centre[r]! + HALF
    return j >= 0 && j < LEVELS ? this.queue[r * LEVELS + j]! : 0
  }

  stats(): Stats {
    const n = Math.min(WINDOW, this.written)
    let ev = 0, fl = 0, vol = 0
    for (let a = 0; a < n; a++) {
      const r = this.row(a)
      ev += this.events[r]!
      fl += this.fills[r]!
      vol += this.volume[r]!
    }
    const secs = n / HZ
    const b = this.book
    return { rate: secs ? ev / secs : 0, trades: fl, shares: vol, mid: b.mid, spread: b.spread, bestBid: b.bestBid, bestAsk: b.bestAsk, t: this.t }
  }
}

/** A sim advanced to the poster frame: the same market on the server and in the browser. */
export function posterSim(): Sim {
  const s = new Sim()
  s.advance(POSTER_T)
  return s
}

export const dollars = (ticks: number) => `$${(ticks * TICK).toFixed(2)}`
export { LIMIT_BUY, LIMIT_SELL, MARKET_BUY, MARKET_SELL, CANCEL_BID, CANCEL_ASK }
