import type { Trade } from './book'
import { Fan, FAN } from '../futures/fan'
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
 * wall second: fan paths drawn, the share of the second it was busy, and the simulated seconds the market ran.
 */
export const HOST = {
  /** Simulated seconds a frame may move the market at most. */
  cap: 0.1,
  /** Fan paths drawn a frame at most: a fan of 4096 in eight frames. */
  pathsPerFrame: 512,
} as const

export class MarketHost {
  market!: Market
  private sim = 0
  private lastAt: number | null = null
  private paused = false
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
  private ran = 0
  private stats = { paths: 0, busy: 0, speed: 1 }

  constructor(
    private readonly seed: number,
    private readonly t0: number,
    private readonly now: () => number,
  ) {
    this.build()
  }

  private build() {
    this.market = new Market(this.seed)
    this.market.advance(this.t0)
    this.sim = this.market.t
    this.market.flow.onTrade = (tr) => this.tape.push(tr)
    this.tape = []
    this.rowsFrom = 0
    this.fanSecond = -Infinity
    this.fanBusy = false
  }

  act(a: Act): void {
    this.market.apply(a)
  }

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
  }

  reset(): void {
    this.build()
  }

  /** The frame at the page's clock `at` (ms), written into `buf`; a fan, if one finished in it. */
  frame(at: number, buf: ArrayBuffer): FanMsg | null {
    const start = this.now()
    const dt = this.lastAt == null ? 0 : Math.max(0, (at - this.lastAt) / 1000)
    this.lastAt = at
    const step = this.paused ? 0 : Math.min(dt, HOST.cap)
    this.held += dt - step
    const t = this.market.t
    this.sim += step
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
      const finished = this.fan.work(HOST.pathsPerFrame)
      this.drawn += this.fanDrawn() - before
      if (finished) {
        this.fanBusy = false
        done = {
          kind: 'fan',
          seq: ++this.fanSeq,
          t: this.fanT,
          sigma: this.fanSigma,
          bands: this.fan.bandsData().slice(),
          strands: this.fan.strands().slice(),
          call: this.fan.call(),
          paths: FAN.paths,
        }
      }
    }

    writeFrame(buf, {
      market: this.market,
      seq: ++this.seq,
      rowsFrom: this.rowsFrom,
      trades: this.tape,
      stats: { ...this.stats, held: this.held, fanSeq: this.fanSeq, paused: this.paused },
    })
    this.rowsFrom = this.market.flow.written
    this.tape.length = 0

    this.work += this.now() - start
    this.wall += dt * 1000
    if (this.wall >= 1000) {
      this.stats = { paths: (this.drawn * 1000) / this.wall, busy: this.work / this.wall, speed: (this.ran * 1000) / this.wall }
      this.wall = this.work = this.drawn = this.ran = 0
    }
    return done
  }

  private fanDrawn(): number {
    return this.fan.progress
  }
}
