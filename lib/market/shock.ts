import { dexp } from './detmath'
import { QUANTA } from './flow'

/**
 * The liquidity shock: what "Liquidity shock" on /market does to the market.
 * At the start of the next quantum (lib/market/engine.ts):
 * 1. a market sell takes every bid within twenty ticks of the best, level by
 *    level from the top, each fill printed on the tape;
 * 2. the Hawkes state takes an exogenous excitation: market sells arrive 60 a
 *    second faster and bid cancellations 180 a second faster, both fading as
 *    a market sell's own excitation does (e^{−2t}, a third of a second's
 *    half-life), so sellers keep coming and buyers pull their bids.
 * Everything after that is the model's own: the refill, the price, the
 * volatility, the stress. Over twenty seeds (tests/market-shock.test.ts),
 * within a second the spread is at least four ticks and the touch has lost
 * four fifths of its shares; the stress passes 0.8 within a second and
 * realized volatility is up a quarter within two; the spread is back within
 * two ticks inside two seconds, and the stress below 0.05 inside five minutes.
 *
 * Shocks stack only up to one. The load is the shocks' worth still in the
 * market, absorbed on a five-second half-life, and a press tops it up to one
 * whole shock, delivering the difference: fifty presses in a second deliver
 * little more than one shock. While more than half a shock is still in, the
 * market is absorbing it, and says so.
 */
export const SHOCK = {
  /** The sweep takes every bid within this many ticks of the best. */
  ticks: 20,
  /** Market sells' intensity lifted by this many a second. */
  sells: 60,
  /** Bid cancellations' intensity lifted by this many a second. */
  cancels: 180,
  /** The load's half-life, in simulated seconds. */
  halfLife: 5,
  /** At most this many shocks' worth in the market at once. */
  cap: 1,
  /** Absorbing while the load is above this. */
  absorbing: 0.5,
} as const

export class Shock {
  /** Shocks' worth still in the market. */
  load = 0
  /** Shocks' worth delivered, in all. */
  delivered = 0
  private readonly k = dexp(-Math.LN2 / (SHOCK.halfLife * QUANTA))

  /** A quantum passes. */
  decay(): void {
    this.load *= this.k
  }

  /** A press: the share of a whole shock it delivers, 0 to 1, topping the load up to the cap. */
  press(): number {
    const f = Math.max(0, SHOCK.cap - this.load)
    this.load += f
    this.delivered += f
    return f
  }

  get absorbing(): boolean {
    return this.load > SHOCK.absorbing
  }
}
