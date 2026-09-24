import { syntheticValue as value } from '@/content/synthetic'

/**
 * Black's formula on a forward, with rates and dividends at zero, so the
 * forward is the spot and nothing in the Greeks depends on a curve this site
 * would have to make up. Everything is per unit of forward; the forward itself
 * is a synthetic round number from facts.ts.
 */

export const FORWARD = value('ivForward')

/** Standard normal density. */
export function pdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)
}

/**
 * Standard normal distribution function. West's double-precision algorithm
 * (Wilmott Magazine, 2005, after Hart 1968): absolute error below 1e-14,
 * which matters because deep in the wings a Greek is a difference of two of
 * these.
 */
export function cdf(x: number): number {
  const z = Math.abs(x)
  let c: number
  if (z > 37) {
    c = 0
  } else {
    const e = Math.exp(-z * z / 2)
    if (z < 7.07106781186547) {
      let n = 3.52624965998911e-2 * z + 0.700383064443688
      n = n * z + 6.37396220353165
      n = n * z + 33.912866078383
      n = n * z + 112.079291497871
      n = n * z + 221.213596169931
      n = n * z + 220.206867912376
      let d = 8.83883476483184e-2 * z + 1.75566716318264
      d = d * z + 16.064177579207
      d = d * z + 86.7807322029461
      d = d * z + 296.564248779674
      d = d * z + 637.333633378831
      d = d * z + 793.826512519948
      d = d * z + 440.413735824752
      c = (e * n) / d
    } else {
      let d = z + 0.65
      d = z + 4 / d
      d = z + 3 / d
      d = z + 2 / d
      d = z + 1 / d
      c = e / d / 2.506628274631
    }
  }
  return x > 0 ? 1 - c : c
}

export interface Greeks {
  /** Call price, in units of the forward's currency. */
  readonly call: number
  readonly put: number
  /** ∂C/∂F. The put delta is this minus one. */
  readonly delta: number
  /** ∂²C/∂F². Same for calls and puts. */
  readonly gamma: number
  /** ∂C/∂σ per one volatility point (0.01). */
  readonly vega: number
  /** ∂C/∂t per calendar day, holding σ fixed. Negative: time decay. */
  readonly theta: number
}

/**
 * Price and Greeks at strike K, expiry T years, volatility σ — the implied
 * volatility the surface gives at that point. Sticky-strike: σ is held fixed
 * while each Greek is taken, which is the convention a desk quotes Greeks in
 * and the one to state out loud, because the surface moving under you is a
 * different, larger question.
 */
export function black(F: number, K: number, T: number, sigma: number): Greeks {
  const sd = sigma * Math.sqrt(T)
  const d1 = (Math.log(F / K) + 0.5 * sd * sd) / sd
  const d2 = d1 - sd
  const call = F * cdf(d1) - K * cdf(d2)
  const put = K * cdf(-d2) - F * cdf(-d1)
  return {
    call,
    put,
    delta: cdf(d1),
    gamma: pdf(d1) / (F * sd),
    vega: (F * pdf(d1) * Math.sqrt(T)) / 100,
    theta: -(F * pdf(d1) * sigma) / (2 * Math.sqrt(T)) / 365,
  }
}
