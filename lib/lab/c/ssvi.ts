import { P } from '@/lib/svi'

/**
 * SSVI with its parameters as an argument. lib/svi.ts is the same surface
 * with the parameters fixed to the synthetic set in content/synthetic.ts; the
 * shock needs them to move, so the formulas are restated here over a `Params`
 * value and tests/lab-c.test.ts checks that, at the calm parameters, every
 * function below returns exactly what lib/svi.ts does.
 *
 *   θ(T) = σ∞²·T + (σ₀² − σ∞²)·(1 − e^(−κT))/κ
 *   φ(θ) = η / (θ^γ (1+θ)^(1−γ))
 *   w(k, θ) = θ/2 · (1 + ρφk + √((φk + ρ)² + 1 − ρ²))
 *
 * k = log(K/F), T in years, w = σ²T the total implied variance.
 */

export interface Params {
  /** At-the-money volatility at the short end, σ₀. */
  readonly s0: number
  /** Long-run at-the-money volatility, σ∞. */
  readonly s1: number
  /** Term-structure decay rate, per year. */
  readonly kappa: number
  /** Skew: the correlation-like tilt of every smile. */
  readonly rho: number
  /** Curvature level. */
  readonly eta: number
  /** Power-law exponent of φ. */
  readonly gamma: number
}

/** The calm surface: the site's synthetic parameters, unchanged. */
export const CALM: Params = {
  s0: P.sigmaShort,
  s1: P.sigmaLong,
  kappa: P.kappa,
  rho: P.rho,
  eta: P.eta,
  gamma: P.gamma,
}

/**
 * The domain drawn. Strikes from 67% to 135% of the forward; expiries from one
 * month to two years, so the one-month readout sits on the surface's back edge
 * rather than off it.
 */
export const DOMAIN = { kMin: -0.4, kMax: 0.3, tMin: 1 / 12, tMax: 2 } as const

export function theta(p: Params, T: number): number {
  const a = p.s0 * p.s0, b = p.s1 * p.s1
  return b * T + ((a - b) * (1 - Math.exp(-p.kappa * T))) / p.kappa
}

export function phi(p: Params, th: number): number {
  return p.eta / (Math.pow(th, p.gamma) * Math.pow(1 + th, 1 - p.gamma))
}

/** Total variance and its first two k-derivatives, analytically. */
export function wk(p: Params, k: number, T: number): { w: number; dk: number; dkk: number } {
  const th = theta(p, T)
  const f = phi(p, th)
  const r = p.rho
  const a = f * k + r
  const s = Math.sqrt(a * a + 1 - r * r)
  return {
    w: (th / 2) * (1 + r * f * k + s),
    dk: (th / 2) * (r * f + (f * a) / s),
    dkk: ((th / 2) * f * f * (1 - r * r)) / (s * s * s),
  }
}

export function w(p: Params, k: number, T: number): number {
  const th = theta(p, T)
  const f = phi(p, th)
  const r = p.rho
  const a = f * k + r
  return (th / 2) * (1 + r * f * k + Math.sqrt(a * a + 1 - r * r))
}

export function iv(p: Params, k: number, T: number): number {
  return Math.sqrt(w(p, k, T) / T)
}

/**
 * Durrleman's g(k): the risk-neutral density at this expiry is non-negative
 * where g ≥ 0. Negative anywhere means a butterfly spread priced below zero.
 */
export function g(p: Params, k: number, T: number): number {
  const { w: v, dk, dkk } = wk(p, k, T)
  const t1 = 1 - (k * dk) / (2 * v)
  return t1 * t1 - ((dk * dk) / 4) * (1 / v + 0.25) + dkk / 2
}

/** ∂w/∂T by central difference (w is smooth in T). */
export function wT(p: Params, k: number, T: number): number {
  const h = Math.min(1e-4, T / 10)
  return (w(p, k, T + h) - w(p, k, T - h)) / (2 * h)
}

/**
 * Gatheral and Jacquier's two butterfly inequalities at one θ (Theorem 4.2's
 * hypotheses, checked directly rather than trusted): θφ(1+|ρ|) < 4 and
 * θφ²(1+|ρ|) ≤ 4. Returns the larger of the two ratios to 4, so < 1 passes.
 */
export function gjRatio(p: Params, th: number): number {
  const f = phi(p, th)
  const m = 1 + Math.abs(p.rho)
  return Math.max((th * f * m) / 4, (th * f * f * m) / 4)
}

export interface Check {
  /** Smallest Durrleman g on the sampled grid. */
  readonly minG: number
  /** Smallest step in total variance from one expiry to the next, at any strike. */
  readonly minDw: number
  readonly points: number
  readonly passes: boolean
}

/**
 * The live no-arbitrage check: Durrleman's g over a strike × expiry grid wider
 * than the drawn domain (butterfly), and total variance rising from each
 * expiry to the next at every strike (calendar). Cheap enough to run a few
 * times a second on the main thread: nk·nT evaluations of closed forms.
 */
export function check(p: Params, nk = 61, nT = 40): Check {
  let minG = Infinity
  let minDw = Infinity
  const k0 = -1, k1 = 0.8
  const prev = new Float64Array(nk)
  for (let j = 0; j < nT; j++) {
    const T = DOMAIN.tMin + ((DOMAIN.tMax - DOMAIN.tMin) * j) / (nT - 1)
    for (let i = 0; i < nk; i++) {
      const k = k0 + ((k1 - k0) * i) / (nk - 1)
      const gi = g(p, k, T)
      if (gi < minG) minG = gi
      const wi = w(p, k, T)
      if (j > 0 && wi - prev[i]! < minDw) minDw = wi - prev[i]!
      prev[i] = wi
    }
  }
  return { minG, minDw, points: nk * nT, passes: minG >= 0 && minDw > 0 }
}
