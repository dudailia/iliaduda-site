import { lots, type Rng } from './rng'

/**
 * A price-level limit order book: at every price tick, a queue of shares
 * waiting to buy (bids) or to sell (asks). Prices are integer ticks.
 *
 * - A limit order joins the queue at a distance from the touch drawn from a
 *   power law (most orders rest near the best price, a few far away), or,
 *   when the spread is wider than one tick, sometimes improves the price
 *   inside it.
 * - A market order walks the opposite side from the touch outward, filling
 *   level by level; every fill is a trade at that level's price.
 * - A cancel removes part of one resting queue, chosen in proportion to its
 *   size, so large queues shed more — which is what keeps the book's depth
 *   stationary rather than growing without bound.
 *
 * Invariants, checked by tests over long runs: best bid < best ask, no queue
 * is ever negative, neither side is ever empty, every fill happens at the
 * touch of the moment, and the touch moves only when a level empties or a
 * limit order improves it.
 */

export const LIMIT_BUY = 0
export const LIMIT_SELL = 1
export const MARKET_BUY = 2
export const MARKET_SELL = 3
export const CANCEL_BID = 4
export const CANCEL_ASK = 5
export const EVENT_NAMES = ['limit buy', 'limit sell', 'market buy', 'market sell', 'cancel bid', 'cancel ask'] as const

export interface Trade {
  t: number
  /** Price in ticks. */
  price: number
  size: number
  /** +1: a buyer took the ask. −1: a seller hit the bid. */
  side: 1 | -1
}

export interface BookParams {
  /** Mean shares above one for a limit order. */
  limitSize: number
  /** Mean shares above one for a market order. */
  marketSize: number
  /** Power-law exponent of the distance from the touch. */
  gamma: number
  /** Furthest distance, in ticks, a new limit order is placed. */
  reach: number
  /** Chance a limit order improves the price when the spread allows it. */
  improve: number
  /** Share of a queue a cancel removes, drawn uniformly in [lo, hi]. */
  cancelLo: number
  cancelHi: number
}

const SPAN = 2048
const MARGIN = 256

export class Book {
  /** Absolute tick of array index 0. */
  base: number
  readonly bid = new Int32Array(SPAN)
  readonly ask = new Int32Array(SPAN)
  bestBid: number
  bestAsk: number
  totalBid = 0
  totalAsk = 0
  private readonly cdf: Float64Array

  constructor(
    readonly p: BookParams,
    private readonly rng: Rng,
    mid: number,
    initial: (d: number) => number,
  ) {
    this.base = mid - SPAN / 2
    this.bestBid = mid - 1
    this.bestAsk = mid + 1
    for (let d = 0; d < p.reach; d++) {
      const q = initial(d)
      this.bid[this.bestBid - d - this.base] = q
      this.ask[this.bestAsk + d - this.base] = q
      this.totalBid += q
      this.totalAsk += q
    }
    const w = Array.from({ length: p.reach }, (_, d) => (1 + d) ** -p.gamma)
    const sum = w.reduce((a, b) => a + b, 0)
    this.cdf = new Float64Array(p.reach)
    let c = 0
    w.forEach((x, d) => (this.cdf[d] = c += x / sum))
  }

  bidAt(price: number): number {
    const i = price - this.base
    return i >= 0 && i < SPAN ? this.bid[i]! : 0
  }
  askAt(price: number): number {
    const i = price - this.base
    return i >= 0 && i < SPAN ? this.ask[i]! : 0
  }
  get spread() {
    return this.bestAsk - this.bestBid
  }
  /** Mid price in ticks; a half tick when the spread is odd. */
  get mid() {
    return (this.bestBid + this.bestAsk) / 2
  }

  /** A wide spread draws liquidity into it: each empty tick inside is another chance to improve. */
  private improveChance(): number {
    return 1 - (1 - this.p.improve) ** (this.spread - 1)
  }

  private distance(): number {
    const u = this.rng()
    let d = 0
    while (d < this.p.reach - 1 && this.cdf[d]! < u) d++
    return d
  }

  /** Keep the touch far from the array's ends; orders that fall off were ~a thousand ticks away. */
  private recentre() {
    const lo = this.bestBid - this.base
    const hi = this.bestAsk - this.base
    if (lo > MARGIN && hi < SPAN - MARGIN) return
    const shift = Math.round(this.mid) - SPAN / 2 - this.base
    for (const [arr, key] of [
      [this.bid, 'totalBid'],
      [this.ask, 'totalAsk'],
    ] as const) {
      const next = new Int32Array(SPAN)
      let total = 0
      for (let i = 0; i < SPAN; i++) {
        const j = i - shift
        if (j >= 0 && j < SPAN) {
          next[j] = arr[i]!
          total += arr[i]!
        }
      }
      arr.set(next)
      this[key] = total
    }
    this.base += shift
  }

  /** Apply one event of the given type. Fills are reported through `onTrade`. */
  apply(type: number, t: number, onTrade?: (tr: Trade) => void): void {
    const { p, rng } = this
    switch (type) {
      case LIMIT_BUY: {
        const size = lots(rng, p.limitSize)
        let price: number
        if (this.spread > 1 && rng() < this.improveChance()) price = this.bestBid + 1 + Math.floor(rng() * (this.spread - 1))
        else price = this.bestBid - this.distance()
        this.bid[price - this.base]! += size
        this.totalBid += size
        if (price > this.bestBid) this.bestBid = price
        break
      }
      case LIMIT_SELL: {
        const size = lots(rng, p.limitSize)
        let price: number
        if (this.spread > 1 && rng() < this.improveChance()) price = this.bestAsk - 1 - Math.floor(rng() * (this.spread - 1))
        else price = this.bestAsk + this.distance()
        this.ask[price - this.base]! += size
        this.totalAsk += size
        if (price < this.bestAsk) this.bestAsk = price
        break
      }
      case MARKET_BUY: {
        // Never take the last share on a side: an empty side has no price.
        let left = Math.min(lots(rng, p.marketSize), this.totalAsk - 1)
        while (left > 0) {
          const i = this.bestAsk - this.base
          const fill = Math.min(left, this.ask[i]!)
          onTrade?.({ t, price: this.bestAsk, size: fill, side: 1 })
          this.ask[i]! -= fill
          this.totalAsk -= fill
          left -= fill
          if (this.ask[i] === 0) {
            let j = i + 1
            while (this.ask[j] === 0) j++
            this.bestAsk = j + this.base
          }
        }
        break
      }
      case MARKET_SELL: {
        let left = Math.min(lots(rng, p.marketSize), this.totalBid - 1)
        while (left > 0) {
          const i = this.bestBid - this.base
          const fill = Math.min(left, this.bid[i]!)
          onTrade?.({ t, price: this.bestBid, size: fill, side: -1 })
          this.bid[i]! -= fill
          this.totalBid -= fill
          left -= fill
          if (this.bid[i] === 0) {
            let j = i - 1
            while (this.bid[j] === 0) j--
            this.bestBid = j + this.base
          }
        }
        break
      }
      case CANCEL_BID:
      case CANCEL_ASK: {
        const bidSide = type === CANCEL_BID
        const arr = bidSide ? this.bid : this.ask
        const total = bidSide ? this.totalBid : this.totalAsk
        // Queue-weighted choice of level, scanning out from the touch.
        let u = rng() * total
        let i = (bidSide ? this.bestBid : this.bestAsk) - this.base
        const step = bidSide ? -1 : 1
        while (u >= arr[i]!) {
          u -= arr[i]!
          i += step
        }
        const q = arr[i]!
        const frac = p.cancelLo + rng() * (p.cancelHi - p.cancelLo)
        const take = Math.min(Math.max(1, Math.round(q * frac)), q, total - 1)
        if (take <= 0) break
        arr[i]! -= take
        if (bidSide) this.totalBid -= take
        else this.totalAsk -= take
        if (arr[i] === 0) {
          if (bidSide && i + this.base === this.bestBid) {
            let j = i - 1
            while (this.bid[j] === 0) j--
            this.bestBid = j + this.base
          } else if (!bidSide && i + this.base === this.bestAsk) {
            let j = i + 1
            while (this.ask[j] === 0) j++
            this.bestAsk = j + this.base
          }
        }
        break
      }
    }
    this.recentre()
  }
}
