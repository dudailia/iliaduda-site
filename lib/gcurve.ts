/**
 * The Bank of Russia's G-curve: the zero-coupon yield curve for OFZ, fitted
 * daily by the Moscow Exchange and published as thirteen numbers.
 *
 *   G(t) = β0 + (β1 + β2)·(τ/t)·(1 − e^(−t/τ)) − β2·e^(−t/τ) + Σ gᵢ·exp(−(t − aᵢ)² / bᵢ²)
 *
 * a Nelson–Siegel curve plus nine Gaussian bumps whose centres and widths grow
 * geometrically (a₁ = 0, a₂ = 0.6, aᵢ₊₁ = aᵢ + 0.6·kⁱ⁻¹; b₁ = 0.6, bᵢ₊₁ = bᵢ·k;
 * k = 1.6), so the short end can bend sharply and the long end cannot. G is a
 * continuously compounded rate in basis points; the published yield is its
 * annually compounded equivalent in percent.
 *
 * tests/gcurve.test.ts reproduces every yield the exchange published for
 * July–August 2023 from the parameters alone.
 */

/** [β0, β1, β2, τ, g1 … g9], in the order the exchange publishes them. */
export type GParams = readonly number[]

const K = 1.6
const A: number[] = [0, 0.6]
const B: number[] = [0.6]
for (let i = 1; i < 8; i++) A.push(A[i]! + 0.6 * K ** i)
for (let i = 1; i < 9; i++) B.push(B[i - 1]! * K)

/** Continuously compounded zero-coupon rate at maturity t years, in basis points. */
export function g(p: GParams, t: number): number {
  const [b0, b1, b2, tau] = p as [number, number, number, number]
  const e = Math.exp(-t / tau)
  let v = b0 + ((b1 + b2) * tau * (1 - e)) / t - b2 * e
  for (let i = 0; i < 9; i++) v += p[4 + i]! * Math.exp(-((t - A[i]!) ** 2) / B[i]! ** 2)
  return v
}

/** Annually compounded zero-coupon yield at maturity t years, in percent. */
export function zcy(p: GParams, t: number): number {
  return 100 * (Math.exp(g(p, t) / 10000) - 1)
}
