import { CANCEL_BID, MARKET_SELL } from './book'
import { BURN, Flow, MARKET, QUANTA, ROWS, SEED } from './flow'
import { stationaryRates } from './hawkes'
import { bitsHash, fingerprint } from './fingerprint'
import { Realised } from './realised'
import { SHOCK, Shock } from './shock'
import { Stress, stressOf } from './stress'

/** What a reader can do to the market: hit it with a liquidity shock (lib/market/shock.ts). */
export type Action = 'shock'

/** An action as it was taken: at the start of quantum `q`, counted from t = 0. */
export interface Logged {
  readonly q: number
  readonly action: Action
}

/**
 * The market behind /market: the order book's own market (lib/market/flow.ts,
 * the same seed and parameters), with what the three views read from it kept
 * alongside, each on the market's own clock, never the wall's. Its realized
 * volatility takes the mid once a simulated second (lib/market/realised.ts),
 * from the burn-in on, so it is warm when first shown.
 *
 * It advances in whole quanta, like the flow it wraps, so one seed is one
 * market however it is stepped: in Node, in the page's worker, at build time
 * (tests/market-engine.test.ts). An action waits for the next quantum's start
 * and is logged with it, so the same seed and the same log are the same
 * market, shocks and all (tests/market-shock.test.ts).
 */
export class Market {
  readonly flow: Flow
  readonly realised = new Realised(60)
  private readonly stressed = new Stress()
  /** The market sells' stationary rate, (I − B)⁻¹μ, that selling pressure is read against. */
  private readonly sellRate: number
  readonly shock = new Shock()
  /** Every action taken, with the quantum it took effect at. */
  readonly log: Logged[] = []
  private readonly pending: Action[] = []
  private script: readonly Logged[] = []
  private played = 0
  /** Realised volatility and stress as each of the flow's rows was written, by the row's ring index. */
  readonly rowSigma = new Float64Array(ROWS)
  readonly rowStress = new Float64Array(ROWS)
  private rowsSeen = 0

  /**
   * `burn` false leaves the burn-in to the caller, whose `advance` runs the same quanta: a page that builds the market
   * on its main thread (the Contents miniatures) runs it a slice at a time, and gets the same market to the bit.
   */
  constructor(seed = SEED, market = MARKET, burn = true) {
    this.flow = new Flow(seed, market, false)
    this.sellRate = stationaryRates(market.hawkes)[MARKET_SELL]!
    // The flow's own burn-in, quantum for quantum, with the volatility taking its seconds as they pass.
    if (burn) while (this.flow.quanta < BURN * QUANTA) this.step()
  }

  /** Simulated seconds. */
  get t(): number {
    return this.flow.t
  }

  /** Annualised realized volatility of the mid, now. */
  get sigma(): number {
    return this.realised.sigma
  }

  /** How far the market is from calm, 0 to 1 (lib/market/stress.ts), now. */
  get stress(): number {
    return this.stressed.s
  }

  /** Market sells' intensity now, against their stationary rate: selling pressure. */
  get pressure(): number {
    return this.flow.hawkes.intensity(MARKET_SELL) / this.sellRate
  }

  /** The shares within three ticks of the best price on the book's thinner side: what a crash drains. */
  get touch(): number {
    const b = this.flow.book
    let bid = 0, ask = 0
    for (let k = 0; k < 3; k++) {
      bid += b.bidAt(b.bestBid - k)
      ask += b.askAt(b.bestAsk + k)
    }
    return Math.min(bid, ask)
  }

  /** Take `action` at the start of the next quantum. */
  apply(action: Action): void {
    this.pending.push(action)
  }

  /** Take a log's actions again, each at the start of the quantum it was taken at: from a market that has not reached the first. */
  replay(log: readonly Logged[]): void {
    if (log.length && log[0]!.q < this.flow.quanta) throw new Error(`the log starts at quantum ${log[0]!.q}, and this market is at ${this.flow.quanta}`)
    this.script = log
    this.played = 0
  }

  private take(action: Action) {
    this.log.push({ q: this.flow.quanta, action })
    const f = this.shock.press()
    if (!(f > 0)) return
    this.flow.sweepBids(Math.round(SHOCK.ticks * f))
    this.flow.hawkes.excite(MARKET_SELL, MARKET_SELL, SHOCK.sells * f)
    this.flow.hawkes.excite(CANCEL_BID, MARKET_SELL, SHOCK.cancels * f)
  }

  /** One quantum of simulated time, after the actions waiting for its start. */
  step(): void {
    while (this.played < this.script.length && this.script[this.played]!.q === this.flow.quanta) this.take(this.script[this.played++]!.action)
    for (const a of this.pending) this.take(a)
    this.pending.length = 0
    this.flow.step()
    if (this.flow.quanta % QUANTA === 0) this.realised.push(this.flow.book.mid)
    this.stressed.update(stressOf(this.pressure, this.realised.sigma, this.flow.book.spread, this.touch), 1 / QUANTA)
    this.shock.decay()
    if (this.flow.written !== this.rowsSeen) {
      this.rowsSeen = this.flow.written
      const r = this.flow.row(0)
      this.rowSigma[r] = this.realised.sigma
      this.rowStress[r] = this.stressed.s
    }
  }

  /** Run whole quanta up to `tEnd`; a fraction of one left over waits for the next call. */
  advance(tEnd: number): void {
    const last = Math.floor(tEnd * QUANTA + 1e-6)
    while (this.flow.quanta < last) this.step()
  }

  /**
   * Everything the market is, the volatility included, as one string: two runs compared in one comparison. Its
   * floating-point state (the clock, the Hawkes excitations, every trade's time, realized volatility, stress and the
   * shock's load) is hashed by its exact bits, so two markets that agree on it agree to the bit.
   */
  hash(): string {
    const f = this.flow
    const exact = [f.t, ...f.hawkes.state(), ...f.trades.map((tr) => tr.t), this.realised.sigma, this.stressed.s, this.shock.load]
    return `${fingerprint(f)}:${this.realised.sigma.toFixed(12)}:${this.stressed.s.toFixed(12)}:${this.shock.load.toFixed(12)}:${bitsHash(exact)}`
  }
}
