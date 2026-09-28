import { H, PROTOCOL, ROW_META, type FanMsg, type Frame } from './protocol'

/**
 * The page's side of /market: the market as the worker last reported it, kept on the main thread for the views.
 *
 * Each frame is taken in when it arrives, in its own task, before any view draws; every view then draws in the next
 * animation frame, whose callbacks all run before another message can land, so all three draw the same market —
 * the sync the page promises. What a frame carries is copied out here (its buffer goes straight back to the
 * worker): the rows of the book the heat strip draws, every trade, and one sample a simulated second of volatility,
 * stress and the mid for the linked hover. The newest fan is kept as the worker drew it, for a price of 1, and
 * scaled by the mid now: exact for geometric Brownian motion, so the fan moves with the price in the frame the
 * price moves.
 */

/** Rows held: the flow's whole ring, twenty-one simulated seconds. */
export const MIRROR_ROWS = 256
const TRADES = 4096
const SECONDS = 600
const L = PROTOCOL.levels
const STEPS = 65

/** The newest header, by name. */
export interface Header {
  seq: number
  t: number
  quanta: number
  mid: number
  spread: number
  bestBid: number
  bestAsk: number
  sigma: number
  stress: number
  pressure: number
  touch: number
  load: number
  absorbing: boolean
  shocks: number
  rate: number
  expected: number
  trades: number
  shares: number
  paths: number
  busy: number
  held: number
  speed: number
  paused: boolean
  centre: number
}

/** A ring of samples a simulated second, oldest first. */
class Seconds {
  private readonly ts = new Float64Array(SECONDS)
  private readonly sig = new Float64Array(SECONDS)
  private readonly str = new Float64Array(SECONDS)
  private readonly mids = new Float64Array(SECONDS)
  private head = -1
  length = 0

  clear() {
    this.head = -1
    this.length = 0
  }

  push(t: number, sigma: number, stress: number, mid: number) {
    this.head = (this.head + 1) % SECONDS
    this.ts[this.head] = t
    this.sig[this.head] = sigma
    this.str[this.head] = stress
    this.mids[this.head] = mid
    if (this.length < SECONDS) this.length++
  }

  private at(k: number) {
    return (this.head - (this.length - 1 - k) + SECONDS * 2) % SECONDS
  }
  t(k: number) {
    return this.ts[this.at(k)]!
  }
  sigma(k: number) {
    return this.sig[this.at(k)]!
  }
  stress(k: number) {
    return this.str[this.at(k)]!
  }
  mid(k: number) {
    return this.mids[this.at(k)]!
  }
}

export class Mirror {
  readonly h: Header = {
    seq: 0, t: 0, quanta: 0, mid: 0, spread: 0, bestBid: 0, bestAsk: 0, sigma: 0, stress: 0, pressure: 0, touch: 0, load: 0,
    absorbing: false, shocks: 0, rate: 0, expected: 0, trades: 0, shares: 0, paths: 0, busy: 0, held: 0, speed: 1, paused: false,
    centre: 0,
  }
  /** The book at now, a row's layout around `h.centre`. */
  readonly ladder = new Float32Array(L)
  private readonly levelRing = new Float32Array(MIRROR_ROWS * L)
  private readonly metaRing = new Float64Array(MIRROR_ROWS * ROW_META)
  private rowHead = -1
  rows = 0
  private readonly tradeRing = new Float64Array(TRADES * 4)
  private tradeHead = -1
  tradeCount = 0
  readonly tradeCapacity = TRADES
  readonly history = new Seconds()
  fan: FanMsg | null = null
  /** The frame the newest shock landed in, and the simulated time it landed at. */
  landedSeq = -1
  landedT = -1
  /** Frames taken; each view compares its own count with it to know whether anything is new. */
  frames = 0

  get seq() {
    return this.h.seq
  }
  get shocks() {
    return this.h.shocks
  }

  take(f: Frame): void {
    const v = f.h
    // Not a frame: a buffer the worker gave back unwritten.
    if (v[H.version] !== PROTOCOL.version) return
    // The worker's market started over (a reset): so does everything kept from the old one.
    if (v[H.quanta]! < this.h.quanta) this.clear()
    const shocks = v[H.shocks]!
    if (shocks > this.h.shocks) {
      this.landedSeq = v[H.seq]!
      this.landedT = v[H.shockQ]! / PROTOCOL.quanta
    }
    const h = this.h
    h.seq = v[H.seq]!
    h.t = v[H.t]!
    h.quanta = v[H.quanta]!
    h.mid = v[H.mid]!
    h.spread = v[H.spread]!
    h.bestBid = v[H.bestBid]!
    h.bestAsk = v[H.bestAsk]!
    h.sigma = v[H.sigma]!
    h.stress = v[H.stress]!
    h.pressure = v[H.pressure]!
    h.touch = v[H.touch]!
    h.load = v[H.load]!
    h.absorbing = v[H.absorbing] === 1
    h.shocks = shocks
    h.rate = v[H.rate]!
    h.expected = v[H.expected]!
    h.trades = v[H.trades]!
    h.shares = v[H.shares]!
    h.paths = v[H.paths]!
    h.busy = v[H.busy]!
    h.held = v[H.held]!
    h.speed = v[H.speed]!
    h.paused = v[H.paused] === 1
    h.centre = v[H.centre]!
    this.ladder.set(f.ladder)

    for (let i = 0; i < f.nRows; i++) {
      const r = (this.rowHead = (this.rowHead + 1) % MIRROR_ROWS)
      this.levelRing.set(f.rows.subarray(i * L, (i + 1) * L), r * L)
      this.metaRing.set(f.rowMeta.subarray(i * ROW_META, (i + 1) * ROW_META), r * ROW_META)
      if (this.rows < MIRROR_ROWS) this.rows++
    }
    for (let i = 0; i < f.nTrades; i++) {
      const r = (this.tradeHead = (this.tradeHead + 1) % TRADES)
      this.tradeRing.set(f.trades.subarray(i * 4, i * 4 + 4), r * 4)
      if (this.tradeCount < TRADES) this.tradeCount++
    }
    const second = Math.floor(h.t)
    if (!this.history.length || second > this.history.t(this.history.length - 1)) this.history.push(second, h.sigma, h.stress, h.mid)
    this.frames++
  }

  takeFan(fan: FanMsg): void {
    this.fan = fan
  }

  private clear() {
    this.rowHead = -1
    this.rows = 0
    this.tradeHead = -1
    this.tradeCount = 0
    this.history.clear()
    this.h.shocks = 0
    this.h.quanta = 0
    this.landedSeq = this.landedT = -1
  }

  /** Ring index of the row `age` rows before the newest. */
  row(age: number): number {
    return (((this.rowHead - age) % MIRROR_ROWS) + MIRROR_ROWS) % MIRROR_ROWS
  }
  time(i: number) {
    return this.metaRing[i * ROW_META]!
  }
  centre(i: number) {
    return this.metaRing[i * ROW_META + 1]!
  }
  mid(i: number) {
    return this.metaRing[i * ROW_META + 2]!
  }
  bid(i: number) {
    return this.metaRing[i * ROW_META + 3]!
  }
  ask(i: number) {
    return this.metaRing[i * ROW_META + 4]!
  }
  /** Shares waiting at each level of row `i`, from `centre(i) − half` up. */
  levels(i: number): Float32Array {
    return this.levelRing.subarray(i * L, (i + 1) * L)
  }

  /** The trade `age` trades before the newest. */
  trade(age: number): { t: number; price: number; size: number; side: number } {
    const r = ((((this.tradeHead - age) % TRADES) + TRADES) % TRADES) * 4
    const g = this.tradeRing
    return { t: g[r]!, price: g[r + 1]!, size: g[r + 2]!, side: g[r + 3]! }
  }

  /** The newest fan's `b`-th percentile at `step` (0 is now), at the price now, in ticks. */
  band(b: number, step: number): number {
    return this.fan ? this.fan.bands[b * STEPS + step]! * this.h.mid : 0
  }
}
