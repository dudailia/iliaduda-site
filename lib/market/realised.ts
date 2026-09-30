import { dexp, dlog } from './detmath'

/** Seconds in a trading year: 252 days of 6.5 hours, the convention the readouts state. */
export const TRADING_SECONDS = 252 * 6.5 * 3600

/**
 * Realised volatility: an exponentially weighted mean of squared one-second
 * log-returns of the mid, annualised. `push` takes the mid once a simulated
 * second; the half-life is in seconds. The weights are normalised by their
 * own sum, so the estimate is unbiased from the first returns on.
 */
export class Realised {
  private last: number | null = null
  private v = 0
  private w = 0
  private readonly k: number

  constructor(readonly halfLife = 60) {
    this.k = 1 - dexp(-Math.LN2 / halfLife)
  }

  push(mid: number): void {
    if (this.last != null && mid > 0 && this.last > 0) {
      const r = dlog(mid / this.last)
      this.v = (1 - this.k) * this.v + this.k * r * r
      this.w = (1 - this.k) * this.w + this.k
    }
    this.last = mid
  }

  /** Annualised volatility, or 0 before the first return. */
  get sigma(): number {
    return this.w > 0 ? Math.sqrt((this.v / this.w) * TRADING_SECONDS) : 0
  }
}
