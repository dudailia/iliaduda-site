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

/**
 * The standard normal quantile, the inverse of `cdf`: Acklam's rational approximation (relative error about 1e-9),
 * then one Halley step on `cdf` itself, which brings it to double precision against this file's own distribution
 * function (tests/bs-inverse.test.ts).
 */
export function inv(p: number): number {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  if (p === 0.5) return 0
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const lo = 0.02425
  let x: number
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p))
    x = (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  } else if (p <= 1 - lo) {
    const q = p - 0.5, r = q * q
    x = ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    x = -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  }
  // Halley's step on cdf(x) − p.
  const e = cdf(x) - p
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2)
  return x - u / (1 + (x * u) / 2)
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
