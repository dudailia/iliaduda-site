import { syntheticValue as value } from '@/content/synthetic'

/**
 * A synthetic implied-volatility surface: Gatheral and Jacquier's SSVI
 * ("Arbitrage-free SVI volatility surfaces", Quantitative Finance, 2014) with
 * a power-law curvature function. Every parameter is chosen by hand and lives
 * in content/synthetic.ts, marked synthetic. Nothing here is fitted to a market.
 *
 * Coordinates: k = log(K/F), log-moneyness, and T in years. The surface is
 * stored as total implied variance w(k, T) = σ²(k, T)·T, which is the quantity
 * the no-arbitrage conditions are stated in.
 *
 *   w(k, θ) = θ/2 · (1 + ρφk + √((φk + ρ)² + 1 − ρ²)),   φ = η / (θ^γ (1+θ)^(1−γ))
 *
 * θ(T) is the at-the-money total variance. It comes from an ATM volatility
 * that decays from σ_short to σ_long at rate κ — the shape of a variance term
 * structure under mean reversion:
 *
 *   θ(T) = σ_long²·T + (σ_short² − σ_long²)·(1 − e^(−κT))/κ
 *
 * which is strictly increasing in T, so there is no calendar arbitrage at the
 * money, and with γ = ½ the condition η(1 + |ρ|) ≤ 2 is sufficient for no
 * butterfly arbitrage at any strike. tests/svi.test.ts
 * checks both on a dense grid rather than trusting the theorem's hypotheses
 * were met.
 */

export const P = {
  sigmaShort: value('ivSigmaShort'),
  sigmaLong: value('ivSigmaLong'),
  kappa: value('ivKappa'),
  rho: value('ivRho'),
  eta: value('ivEta'),
  gamma: value('ivGamma'),
} as const

/**
 * The domain the figure draws: strikes from about 67% to 135% of the forward,
 * expiries from five weeks to two years. A power-law φ grows without bound as
 * θ → 0, so the shortest expiries have the steepest wings; starting at five
 * weeks keeps the far downside under 60% rather than letting one corner of the
 * surface dwarf the rest.
 */
export const DOMAIN = {
  kMin: -0.4,
  kMax: 0.3,
  tMin: 0.1,
  tMax: 2,
} as const

export function theta(T: number): number {
  const { sigmaShort: s0, sigmaLong: s1, kappa } = P
  return s1 * s1 * T + (s0 * s0 - s1 * s1) * (1 - Math.exp(-kappa * T)) / kappa
}

export function phi(th: number): number {
  const { eta, gamma } = P
  return eta / (Math.pow(th, gamma) * Math.pow(1 + th, 1 - gamma))
}

/** Total implied variance. */
export function w(k: number, T: number): number {
  const th = theta(T)
  const f = phi(th)
  const { rho } = P
  const a = f * k + rho
  return (th / 2) * (1 + rho * f * k + Math.sqrt(a * a + 1 - rho * rho))
}

/** ∂w/∂k and ∂²w/∂k², analytically. */
export function wk(k: number, T: number): { w: number; dk: number; dkk: number } {
  const th = theta(T)
  const f = phi(th)
  const { rho } = P
  const a = f * k + rho
  const s = Math.sqrt(a * a + 1 - rho * rho)
  return {
    w: (th / 2) * (1 + rho * f * k + s),
    dk: (th / 2) * (rho * f + (f * a) / s),
    dkk: ((th / 2) * f * f * (1 - rho * rho)) / (s * s * s),
  }
}

/** ∂w/∂T by central difference; w is smooth in T, so this is exact to ~1e-9. */
export function wT(k: number, T: number): number {
  const h = Math.min(1e-4, T / 10)
  return (w(k, T + h) - w(k, T - h)) / (2 * h)
}

/** Implied volatility. */
export function iv(k: number, T: number): number {
  return Math.sqrt(w(k, T) / T)
}

/**
 * Durrleman's condition g(k) ≥ 0: the density implied by the smile at one
 * expiry is non-negative, which is what "no butterfly arbitrage" means. It is
 * also the denominator of the local-variance formula below.
 */
export function g(k: number, T: number): number {
  const { w: v, dk, dkk } = wk(k, T)
  const t1 = 1 - (k * dk) / (2 * v)
  return t1 * t1 - (dk * dk / 4) * (1 / v + 0.25) + dkk / 2
}

/**
 * Dupire local volatility, written in total variance (Gatheral, The Volatility
 * Surface, eq. 1.10): σ_loc² = (∂w/∂T) / g(k).
 */
export function localVol(k: number, T: number): number {
  return Math.sqrt(wT(k, T) / g(k, T))
}

/** Sample the surface on an (nk × nT) grid, row-major by expiry. */
export function grid(nk: number, nT: number): { k: number[]; T: number[]; iv: Float32Array } {
  const ks = Array.from({ length: nk }, (_, i) => DOMAIN.kMin + ((DOMAIN.kMax - DOMAIN.kMin) * i) / (nk - 1))
  const Ts = Array.from({ length: nT }, (_, j) => DOMAIN.tMin + ((DOMAIN.tMax - DOMAIN.tMin) * j) / (nT - 1))
  const out = new Float32Array(nk * nT)
  for (let j = 0; j < nT; j++) {
    for (let i = 0; i < nk; i++) out[j * nk + i] = iv(ks[i]!, Ts[j]!)
  }
  return { k: ks, T: Ts, iv: out }
}
