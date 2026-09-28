import { BURN, Flow, MARKET, QUANTA, SEED } from './flow'
import { fingerprint } from './fingerprint'
import { Realised } from './realised'
import { Stress, stressOf } from './stress'

/**
 * The market behind /market: the order book's own market (lib/market/flow.ts,
 * the same seed and parameters), with what the three views read from it kept
 * alongside, each on the market's own clock, never the wall's. Its realised
 * volatility takes the mid once a simulated second (lib/market/realised.ts),
 * from the burn-in on, so it is warm when first shown.
 *
 * It advances in whole quanta, like the flow it wraps, so one seed is one
 * market however it is stepped: in Node, in the page's worker, at build time
 * (tests/market-engine.test.ts).
 */
export class Market {
  readonly flow: Flow
  readonly realised = new Realised(60)
  private readonly stressed = new Stress()

  constructor(seed = SEED, market = MARKET) {
    this.flow = new Flow(seed, market, false)
    // The flow's own burn-in, quantum for quantum, with the volatility taking its seconds as they pass.
    while (this.flow.quanta < BURN * QUANTA) this.step()
  }

  /** Simulated seconds. */
  get t(): number {
    return this.flow.t
  }

  /** Annualised realised volatility of the mid, now. */
  get sigma(): number {
    return this.realised.sigma
  }

  /** How far the market is from calm, 0 to 1 (lib/market/stress.ts), now. */
  get stress(): number {
    return this.stressed.s
  }

  /** The shares waiting within three ticks of the touch, both sides: what a sweep drains. */
  get touch(): number {
    const b = this.flow.book
    let d = 0
    for (let k = 0; k < 3; k++) d += b.bidAt(b.bestBid - k) + b.askAt(b.bestAsk + k)
    return d
  }

  /** One quantum of simulated time. */
  step(): void {
    this.flow.step()
    if (this.flow.quanta % QUANTA === 0) this.realised.push(this.flow.book.mid)
    this.stressed.update(stressOf(this.realised.sigma, this.flow.book.spread, this.touch), 1 / QUANTA)
  }

  /** Run whole quanta up to `tEnd`; a fraction of one left over waits for the next call. */
  advance(tEnd: number): void {
    const last = Math.floor(tEnd * QUANTA + 1e-6)
    while (this.flow.quanta < last) this.step()
  }

  /** Everything the market is, the volatility included, as one string: two runs compared in one comparison. */
  hash(): string {
    return `${fingerprint(this.flow)}:${this.realised.sigma.toFixed(12)}:${this.stressed.s.toFixed(12)}`
  }
}
