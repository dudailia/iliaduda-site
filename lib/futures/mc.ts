import { cdf } from '@/lib/bs'

/**
 * The CPU mirror of the GPU Monte Carlo in components/figures/futures/renderer.ts.
 *
 * Every random number on the page comes from one counter-based generator:
 * PCG4D (Jarzynski and Olano, "Hash Functions for GPU Rendering", JCGT 2020)
 * applied to (path id, step group, seed, salt). There is no state to carry
 * between draws, so the GPU can give every fragment its own path and this file
 * can regenerate any path the GPU drew, bit for bit in the uniforms, with the
 * same integer arithmetic. The shader text lives in ./glsl.ts beside it; the
 * tests read both.
 *
 * Model: geometric Brownian motion under the risk-neutral measure, stepped
 * exactly in log space, so the only error in the price is Monte Carlo error.
 * The parameters are synthetic round numbers, labelled so wherever shown.
 */

export const MODEL = {
  /** Today's price. */
  s0: 100,
  /** Years to expiry. */
  T: 1,
  /** Continuously compounded risk-free rate. */
  r: 0.03,
  /** Time steps per path. The pricing kernel walks all of them. */
  steps: 64,
  /** Defaults for the two inputs. */
  sigma: 0.25,
  strike: 100,
  /** Input ranges. */
  sigmaMin: 0.05,
  sigmaMax: 0.8,
  strikeMin: 60,
  strikeMax: 160,
  /** The generator's fixed seed: the ensemble is the same on every device. */
  seed: 0x2f3a8c,
} as const

/** Step groups per path: each hash call yields four normals. */
export const GROUPS = MODEL.steps / 4
/** A run stops at 2^28 paths; after that the estimate is left standing. */
export const CAP_LOG2 = 28
export const SALT = 0x9e3779b9

const out = new Uint32Array(4)

/**
 * PCG4D. `Math.imul` is the 32-bit wrapping multiply GLSL's `uint *` is; every
 * intermediate is kept to uint32 with `>>> 0`, so this returns exactly what
 * the shader's pcg4d returns for the same input.
 */
export function pcg4d(a: number, b: number, c: number, d: number): Uint32Array {
  let x = (Math.imul(a >>> 0, 1664525) + 1013904223) >>> 0
  let y = (Math.imul(b >>> 0, 1664525) + 1013904223) >>> 0
  let z = (Math.imul(c >>> 0, 1664525) + 1013904223) >>> 0
  let w = (Math.imul(d >>> 0, 1664525) + 1013904223) >>> 0
  x = (x + Math.imul(y, w)) >>> 0
  y = (y + Math.imul(z, x)) >>> 0
  z = (z + Math.imul(x, y)) >>> 0
  w = (w + Math.imul(y, z)) >>> 0
  x = (x ^ (x >>> 16)) >>> 0
  y = (y ^ (y >>> 16)) >>> 0
  z = (z ^ (z >>> 16)) >>> 0
  w = (w ^ (w >>> 16)) >>> 0
  x = (x + Math.imul(y, w)) >>> 0
  y = (y + Math.imul(z, x)) >>> 0
  z = (z + Math.imul(x, y)) >>> 0
  w = (w + Math.imul(y, z)) >>> 0
  out[0] = x
  out[1] = y
  out[2] = z
  out[3] = w
  return out
}

/** A uniform in (0, 1) from the top 23 bits: exact in float32, so the GPU gets the same value. */
export const unit = (h: number) => ((h >>> 9) + 0.5) / 8388608

/** Four standard normals for step group `g` of path `id` (Box–Muller, both branches). */
export function normals4(id: number, g: number, z: Float64Array | number[], seed: number = MODEL.seed): void {
  const h = pcg4d(id, g, seed, SALT)
  const r0 = Math.sqrt(-2 * Math.log(unit(h[0]!)))
  const t0 = 2 * Math.PI * unit(h[1]!)
  const r1 = Math.sqrt(-2 * Math.log(unit(h[2]!)))
  const t1 = 2 * Math.PI * unit(h[3]!)
  z[0] = r0 * Math.cos(t0)
  z[1] = r0 * Math.sin(t0)
  z[2] = r1 * Math.cos(t1)
  z[3] = r1 * Math.sin(t1)
}

/** Per-step drift and volatility of log price. */
export function stepCoefficients(sigma: number, m = MODEL) {
  const dt = m.T / m.steps
  return { drift: (m.r - 0.5 * sigma * sigma) * dt, vol: sigma * Math.sqrt(dt) }
}

const zs = new Float64Array(4)

/** The whole path of `id`: `steps + 1` prices, today first. */
export function path(id: number, sigma: number, m = MODEL): Float64Array {
  const { drift, vol } = stepCoefficients(sigma, m)
  const s = new Float64Array(m.steps + 1)
  let x = 0
  s[0] = m.s0
  for (let g = 0; g < m.steps / 4; g++) {
    normals4(id, g, zs, m.seed)
    for (let k = 0; k < 4; k++) {
      x += drift + vol * zs[k]!
      s[g * 4 + k + 1] = m.s0 * Math.exp(x)
    }
  }
  return s
}

/** The price at expiry of path `id`, walking every step as the kernel does. */
export function terminal(id: number, sigma: number, m = MODEL): number {
  const { drift, vol } = stepCoefficients(sigma, m)
  let x = 0
  for (let g = 0; g < m.steps / 4; g++) {
    normals4(id, g, zs, m.seed)
    x += 4 * drift + vol * (zs[0]! + zs[1]! + zs[2]! + zs[3]!)
  }
  return m.s0 * Math.exp(x)
}

/** Black–Scholes price of a European call. */
export function bsCall(s0: number, K: number, T: number, r: number, sigma: number): number {
  const sd = sigma * Math.sqrt(T)
  const d1 = (Math.log(s0 / K) + (r + 0.5 * sigma * sigma) * T) / sd
  return s0 * cdf(d1) - K * Math.exp(-r * T) * cdf(d1 - sd)
}

export const bs = (sigma: number, K: number, m = MODEL) => bsCall(m.s0, K, m.T, m.r, sigma)

/**
 * Running sums in float64 and what they estimate. The GPU hands back, per
 * batch, the sum of payoffs, of squared payoffs, of terminal prices and the
 * count; this adds them up across batches and frames.
 */
export class Estimator {
  n = 0
  sum = 0
  sum2 = 0
  sumS = 0
  constructor(readonly discount: number) {}
  add(sum: number, sum2: number, sumS: number, n: number) {
    this.sum += sum
    this.sum2 += sum2
    this.sumS += sumS
    this.n += n
  }
  reset() {
    this.n = this.sum = this.sum2 = this.sumS = 0
  }
  /** Discounted mean payoff: the Monte Carlo price. */
  get mean() {
    return this.n ? (this.discount * this.sum) / this.n : NaN
  }
  /** Standard error of the price. */
  get se() {
    if (this.n < 2) return NaN
    const m = this.sum / this.n
    const v = Math.max(0, (this.sum2 - this.n * m * m) / (this.n - 1))
    return this.discount * Math.sqrt(v / this.n)
  }
  /** Mean terminal price, which should be s0·e^{rT}: the martingale check. */
  get forward() {
    return this.n ? this.sumS / this.n : NaN
  }
}

export const discount = (m = MODEL) => Math.exp(-m.r * m.T)

/** Price with paths `[from, from + n)` on the CPU. */
export function price(sigma: number, K: number, n: number, from = 0, m = MODEL) {
  const e = new Estimator(discount(m))
  let s = 0, s2 = 0, sS = 0
  for (let i = 0; i < n; i++) {
    const ST = terminal(from + i, sigma, m)
    const p = Math.max(ST - K, 0)
    s += p
    s2 += p * p
    sS += ST
  }
  e.add(s, s2, sS, n)
  return e
}

/** The histogram the GPU scatters: bins of terminal price over [lo, hi). */
export const HIST = { lo: 20, hi: 240, bins: 88 } as const
export const binWidth = (HIST.hi - HIST.lo) / HIST.bins
