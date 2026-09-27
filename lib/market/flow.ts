import { syntheticValue } from '@/content/synthetic'
import { dexp } from './detmath'
import { Book, CANCEL_ASK, CANCEL_BID, LIMIT_BUY, LIMIT_SELL, MARKET_BUY, MARKET_SELL, type BookParams, type Trade } from './book'
import { Hawkes, stationaryRates, type HawkesParams } from './hawkes'
import { MARKET, SEED } from './params'
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

export { BOOK, HAWKES, MARKET, SEED } from './params'
/** Price in dollars of one tick, and the opening mid in ticks (content/synthetic.ts). */
export const TICK = syntheticValue('mkTick')
export const START = Math.round(syntheticValue('mkOpen') / TICK)
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
/**
 * The clock moves in quanta of 1/60 of a simulated second, so what the market
 * does depends only on how far it has run, never on how the frames fall: the
 * thinning restarts at each quantum's end, the same ends every time.
 */
export const QUANTA = 60
const PER_ROW = QUANTA / HZ
const BURN_Q = BURN * QUANTA
/** Events kept for the order-flow figure: about 27 simulated seconds at 300 a second. */
export const EVENTS = 8192
/** The two market-order types, whose intensities the order-flow figure draws exactly. */
const DRAWN = [MARKET_BUY, MARKET_SELL] as const

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

export class Flow {
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
  /**
   * The most recent events, as parallel arrays in a ring (`event(age)` finds one): when, what, at which level and
   * how many shares, how far from the touch on its side (ticks; negative inside the spread), the queue at that side's
   * touch before and after (`moved`: the touch itself moved), the intensity of its type just before it, and, after
   * it, the excitation of the two market-order types by each source type — from which their intensity at any later
   * moment follows exactly, until the next event.
   */
  readonly ev = {
    t: new Float64Array(EVENTS),
    type: new Uint8Array(EVENTS),
    price: new Int32Array(EVENTS),
    size: new Int32Array(EVENTS),
    dist: new Int16Array(EVENTS),
    qBefore: new Int32Array(EVENTS),
    qAfter: new Int32Array(EVENTS),
    moved: new Uint8Array(EVENTS),
    lam: new Float64Array(EVENTS),
    exc: new Float64Array(EVENTS * DRAWN.length * 6),
  }
  /** Ring index of the newest event, and how many the ring holds. */
  eventHead = -1
  eventCount = 0
  /** Queue at the best bid and the best ask when each row was written. */
  readonly bidQueue = new Int32Array(ROWS)
  readonly askQueue = new Int32Array(ROWS)
  private pendingEvents = 0
  private pendingFills = 0
  private pendingVolume = 0
  /** Quanta run since t = 0. */
  private q = 0

  constructor(seed = SEED, market: { hawkes: HawkesParams; book: BookParams } = MARKET) {
    const rng = mulberry32(seed)
    this.hawkes = new Hawkes(market.hawkes, rng)
    this.rho = this.hawkes.rho
    this.expected = stationaryRates(market.hawkes).reduce((a, b) => a + b, 0)
    this.book = new Book(market.book, rng, START, (d) => Math.round(4 + 10 * dexp(-((d - 6) * (d - 6)) / 60)))
    while (this.q < BURN_Q) this.quantum(false)
  }

  get t() {
    return this.hawkes.t
  }

  private run(tEnd: number, keep: boolean) {
    this.hawkes.run(tEnd, (t, type, before) => {
      const b = this.book
      const bidSide = type === LIMIT_BUY || type === CANCEL_BID || type === MARKET_SELL
      const touch = bidSide ? b.bestBid : b.bestAsk
      const q0 = bidSide ? b.bidAt(touch) : b.askAt(touch)
      b.apply(type, t, keep ? this.trade : undefined)
      if (keep) this.pendingEvents++
      const e = (this.eventHead = (this.eventHead + 1) % EVENTS)
      if (this.eventCount < EVENTS) this.eventCount++
      const ev = this.ev
      const now = bidSide ? b.bestBid : b.bestAsk
      ev.t[e] = t
      ev.type[e] = type
      ev.price[e] = b.last.price
      ev.size[e] = b.last.size
      ev.dist[e] = type === MARKET_BUY || type === MARKET_SELL ? 0 : bidSide ? touch - b.last.price : b.last.price - touch
      ev.qBefore[e] = q0
      ev.qAfter[e] = bidSide ? b.bidAt(now) : b.askAt(now)
      ev.moved[e] = now !== touch ? 1 : 0
      ev.lam[e] = before
      const K = this.hawkes.k
      for (let d = 0; d < DRAWN.length; d++) for (let j = 0; j < K; j++) ev.exc[(e * DRAWN.length + d) * 6 + j] = this.hawkes.excitation(DRAWN[d]!, j)
    })
  }

  /** Ring index of the event `age` events before the newest, or -1. */
  event(age: number): number {
    if (age < 0 || age >= this.eventCount) return -1
    return (((this.eventHead - age) % EVENTS) + EVENTS) % EVENTS
  }

  private trade = (tr: Trade) => {
    this.pendingFills++
    this.pendingVolume += tr.size
    this.trades.push(tr)
    if (this.trades.length > MAX_TRADES) this.trades.splice(0, this.trades.length - MAX_TRADES)
    this.onTrade?.(tr)
  }

  private quantum(keep: boolean) {
    this.q++
    this.run(this.q / QUANTA, keep)
    if (keep && (this.q - BURN_Q) % PER_ROW === 0) this.snapshot(this.q / QUANTA)
  }

  /** One quantum of simulated time; every PER_ROW-th writes a row. */
  step(): void {
    this.quantum(true)
  }

  /** Run whole quanta up to `tEnd`; a fraction of one left over waits for the next call. Returns the rows written. */
  advance(tEnd: number): number {
    const w = this.written
    const last = Math.floor(tEnd * QUANTA + 1e-6)
    while (this.q < last) this.step()
    return this.written - w
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
    this.bidQueue[r] = b.bidAt(b.bestBid)
    this.askQueue[r] = b.askAt(b.bestAsk)
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
export function posterFlow(): Flow {
  const s = new Flow()
  s.advance(POSTER_T)
  return s
}

export const dollars = (ticks: number) => `$${(ticks * TICK).toFixed(2)}`
export { LIMIT_BUY, LIMIT_SELL, MARKET_BUY, MARKET_SELL, CANCEL_BID, CANCEL_ASK }

/**
 * Which earlier event set off the event `age` events ago, by the branching
 * structure of the Hawkes process: its intensity just before it is its baseline
 * plus one term per earlier event, and each term's share is the probability
 * that event was its parent; the baseline's share is the probability it was an
 * immigrant, arriving on its own. The sum runs over the last six seconds, past
 * which every kernel has decayed below a millionth.
 */
export function attribute(
  f: Flow,
  age: number,
  p: HawkesParams,
): { immigrant: number; parents: { age: number; p: number }[]; top: { age: number; p: number } | null; lambda: number } {
  const e = f.event(age)
  const u = f.ev.type[e]!
  const ti = f.ev.t[e]!
  const w: { age: number; p: number }[] = []
  let lambda = p.mu[u]!
  for (let a = age + 1; a < f.eventCount; a++) {
    const k = f.event(a)
    const dt = ti - f.ev.t[k]!
    if (dt > 6) break
    const src = f.ev.type[k]!
    const x = p.jump[u]![src]! * dexp(-p.decay[src]! * dt)
    if (x > 0) {
      w.push({ age: a, p: x })
      lambda += x
    }
  }
  let top: { age: number; p: number } | null = null
  for (const q of w) {
    q.p /= lambda
    if (!top || q.p > top.p) top = q
  }
  return { immigrant: p.mu[u]! / lambda, parents: w, top, lambda }
}
