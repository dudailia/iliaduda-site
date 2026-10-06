import type { Trade } from './book'
import { Fan, FAN } from '../futures/fan'
import { MODEL } from '../futures/mc'
import { Market } from './engine'
import { writeFrame } from './frame'
import type { Act, FanMsg } from './protocol'

/**
 * The worker's core, apart from its messages (lib/market/market.worker.ts), so Node can test it
 * (tests/market-host.test.ts).
 *
 * The market runs at the page's clock: each frame the page asks for moves it on by the time since the page's last
 * frame, at most a tenth of a second, so a tab left in the background, or a phone that drops frames, finds the
 * market where it left it and never races through the missed minutes; the time held is counted and shown. Paused,
 * it holds. A fan of futures is begun at the start and at each new simulated second, at the volatility of that
 * second, for a price of 1 (the page scales it by the mid, exact for geometric Brownian motion, so the fan moves
 * with the price in the very frame the price moves), and drawn a slice a frame. The host measures itself over each
 * wall second: futures drawn a second of its own time (the fan's slices timed alone: what this device can draw, not
 * how many a second the page asks for), the share of the second it was busy, and the simulated seconds the market ran.
 */
export const HOST = {
  /** Simulated seconds a frame may move the market at most. */
  cap: 0.1,
  /** Fan paths drawn a frame at most: a fan of 4096 in eight frames, and eight more to take its percentiles. */
  pathsPerFrame: 512,
} as const

/**
 * The market /market's ?debug=1 checks each browser against: the seeded market from the moment the figure opens on,
 * shocked five simulated seconds later, and hashed fifteen after that (lib/market/engine.ts). Node computes it at
 * build; the browser's worker computes it again, so a browser that ran a different market would say so.
 */
export function shockedHash(seed: number, t: number): string {
  const m = new Market(seed)
  m.advance(t + 5)
  m.apply('shock')
  m.advance(t + 20)
  return m.hash()
}

export class MarketHost {
  market!: Market
  private sim = 0
  private lastAt: number | null = null
  private paused = false
  /** How fast the market runs against the page's clock, 0 to 1: below 1 only while it coasts to or from a Pause. */
  private rate = 1
  private rowsFrom = 0
  private tape: Trade[] = []
  private seq = 0
  private held = 0
  private readonly fan = new Fan()
  private fanSecond = -Infinity
  private fanBusy = false
  private fanSeq = 0
  private fanT = 0
  private fanSigma = 0
  // The current wall second's tallies, and the last whole second's results.
  private wall = 0
  private work = 0
  private drawn = 0
  private drawMs = 0
  private ran = 0
  private stats = { paths: 0, busy: 0, speed: 1 }
  private resets = 0

  constructor(
    private readonly seed: number,
    private readonly t0: number,
    private readonly now: () => number,
  ) {
    this.build()
  }

  private scheduled: { a: Act; at: number } | null = null

  private build() {
    this.scheduled = null
    this.market = new Market(this.seed)
    this.market.advance(this.t0)
    this.sim = this.market.t
    this.market.flow.onTrade = (tr) => this.tape.push(tr)
    this.tape = []
    this.rowsFrom = 0
    this.fanSecond = -Infinity
    this.fanBusy = false
  }

  /**
   * An action now, or one waiting for simulated time `at`: /market's story lands its shock on one quantum, 2.5
   * simulated seconds after the figure's opening, whatever the frames' timing (sent when the wall clock said so, it
   * landed a quantum early or late, and the same seed's market then answered a shock with a 75% volatility or a 24%
   * one). An action taken now drops one waiting.
   */
  act(a: Act, at?: number): void {
    if (at !== undefined && at > this.market.t) {
      this.scheduled = { a, at }
      return
    }
    this.scheduled = null
    this.market.apply(a)
  }

  unschedule(): void {
    this.scheduled = null
  }

  pause(): void {
    this.paused = true
    // A market paused before its first frame (Pause kept from an earlier page) opens at rest, with no coast.
    if (this.lastAt == null) this.rate = 0
  }

  resume(): void {
    this.paused = false
  }

  reset(): void {
    this.resets++
    this.build()
  }

  /**
   * The opening second's fan, whole, before the first frame is asked for (the worker sends it with 'ready'): drawn a
   * slice a frame, the futures pane came in about eight frames after the book and the surface, and after a paper's
   * morph that was the one pane still empty. The fan has its own seed, so the market is the same either way.
   */
  openingFan(): FanMsg {
    const second = Math.floor(this.market.t)
    this.fanSecond = second
    this.fanT = second
    this.fanSigma = this.market.sigma
    this.fan.begin(1, this.fanSigma)
    while (!this.fan.work(HOST.pathsPerFrame));
    this.fanBusy = false
    return this.fanMsg()
  }

  private fanMsg(): FanMsg {
    return {
      kind: 'fan',
      seq: ++this.fanSeq,
      t: this.fanT,
      sigma: this.fanSigma,
      r: MODEL.r,
      dt: MODEL.T / MODEL.steps,
      bands: this.fan.bandsData().slice(),
      strands: this.fan.strands().slice(),
      call: this.fan.call(),
      paths: FAN.paths,
    }
  }

  /** The frame at the page's clock `at` (ms), written into `buf`; a fan, if one finished in it. */
  frame(at: number, buf: ArrayBuffer): FanMsg | null {
    const start = this.now()
    const dt = this.lastAt == null ? 0 : Math.max(0, (at - this.lastAt) / 1000)
    this.lastAt = at
    // Paused, the market coasts to rest over 240ms, and picks up over 400ms on Resume, as the order book's does and
    // the surface above it: one button, one way of stopping.
    this.rate = this.paused ? Math.max(0, this.rate - dt / 0.24) : Math.min(1, this.rate + dt / 0.4)
    const capped = Math.min(dt, HOST.cap)
    const step = capped * this.rate
    // Held: the time the page was away or too slow to follow, which the market did not run; the reader's own pause
    // (and its coast) is not that.
    if (!this.paused) this.held += dt - capped
    const t = this.market.t
    this.sim += step
    // An action waiting for its time is taken at the start of the quantum that time falls in.
    const s = this.scheduled
    if (s && this.sim >= s.at) {
      this.market.advance(s.at)
      this.market.apply(s.a)
      this.scheduled = null
    }
    this.market.advance(this.sim)
    this.ran += this.market.t - t

    // The fan: the newest second's, once the last is drawn.
    let done: FanMsg | null = null
    const second = Math.floor(this.market.t)
    if (!this.fanBusy && second > this.fanSecond) {
      this.fanSecond = second
      this.fanT = second
      this.fanSigma = this.market.sigma
      this.fan.begin(1, this.fanSigma)
      this.fanBusy = true
    }
    if (this.fanBusy) {
      const before = this.fanDrawn()
      const t0 = this.now()
      const finished = this.fan.work(HOST.pathsPerFrame)
      this.drawMs += this.now() - t0
      this.drawn += this.fanDrawn() - before
      if (finished) {
        this.fanBusy = false
        done = this.fanMsg()
      }
    }

    writeFrame(buf, {
      market: this.market,
      seq: ++this.seq,
      rowsFrom: this.rowsFrom,
      trades: this.tape,
      stats: { ...this.stats, held: this.held, fanSeq: this.fanSeq, paused: this.paused, resets: this.resets },
    })
    this.rowsFrom = this.market.flow.written
    this.tape.length = 0

    this.work += this.now() - start
    // A frame's share of the wall second is at most the cap: a page back from away is measured from its return.
    this.wall += Math.min(dt, HOST.cap) * 1000
    if (this.wall >= 1000) {
      this.stats = { paths: this.drawMs > 0 ? (this.drawn * 1000) / this.drawMs : this.stats.paths, busy: this.work / this.wall, speed: (this.ran * 1000) / this.wall }
      this.wall = this.work = this.drawn = this.drawMs = this.ran = 0
    }
    return done
  }

  private fanDrawn(): number {
    return this.fan.progress
  }
}
