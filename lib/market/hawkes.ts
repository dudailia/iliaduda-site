import { expo, type Rng } from './rng'

/**
 * A multivariate Hawkes process with exponential kernels: order flow in which
 * every event raises the chance of more events, which then fades.
 *
 *   λ_i(t) = μ_i + Σ_j Σ_{t_k^j < t} a_ij · exp(−β_j (t − t_k^j))
 *
 * `jump[i][j]` = a_ij is how much one event of type j lifts the intensity of
 * type i; `decay[j]` = β_j is how fast that lift fades. The branching matrix
 * B_ij = a_ij / β_j is the expected number of type-i events one type-j event
 * triggers directly. The process is stationary only when the spectral radius
 * of B is below one; the constructor refuses anything else.
 *
 * Simulation is exact, by Ogata's thinning. Between events every intensity
 * only decays, so the total intensity now bounds it until the next event: draw
 * a candidate from an exponential at that bound, accept it with probability
 * λ(t)/λ*, and pick its type in proportion to λ_i(t). The kernel state is kept
 * as a K×K matrix of excitations, decayed in closed form, so each step costs
 * O(K²) however long the history.
 */

export interface HawkesParams {
  /** Baseline rate of each event type, per second of simulated time. */
  readonly mu: readonly number[]
  /** jump[i][j]: lift in λ_i from one event of type j. */
  readonly jump: readonly (readonly number[])[]
  /** decay[j]: fade rate of excitation caused by type j, per second. */
  readonly decay: readonly number[]
}

export function branchingMatrix(p: HawkesParams): number[][] {
  return p.jump.map((row) => row.map((a, j) => a / p.decay[j]!))
}

/**
 * Perron root of a non-negative matrix. Power iteration on B + I, which is
 * primitive whenever B is irreducible, so it converges without the
 * oscillation plain iteration can show on a periodic matrix.
 */
export function spectralRadius(B: readonly (readonly number[])[]): number {
  const n = B.length
  let v = new Array<number>(n).fill(1 / n)
  let lambda = 0
  for (let it = 0; it < 500; it++) {
    const w = v.map((vi, i) => vi + B[i]!.reduce((s, b, j) => s + b * v[j]!, 0))
    const norm = w.reduce((s, x) => s + x, 0)
    const next = norm - 1
    v = w.map((x) => x / norm)
    if (Math.abs(next - lambda) < 1e-13) return next
    lambda = next
  }
  return lambda
}

/** Solve A x = b by Gaussian elimination with partial pivoting. */
export function solve(A: readonly (readonly number[])[], b: readonly number[]): number[] {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]!])
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r
    ;[M[c], M[piv]] = [M[piv]!, M[c]!]
    for (let r = c + 1; r < n; r++) {
      const f = M[r]![c]! / M[c]![c]!
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r]![n]!
    for (let k = r + 1; k < n; k++) s -= M[r]![k]! * x[k]!
    x[r] = s / M[r]![r]!
  }
  return x
}

/** Stationary mean rate of each type: Λ = (I − B)⁻¹ μ. */
export function stationaryRates(p: HawkesParams): number[] {
  const B = branchingMatrix(p)
  const IB = B.map((row, i) => row.map((b, j) => (i === j ? 1 : 0) - b))
  return solve(IB, p.mu)
}

export class Hawkes {
  readonly k: number
  /** Simulated time, seconds. */
  t = 0
  /** Accepted events so far, by type. */
  readonly counts: number[]
  /** Branching ratio: spectral radius of B. */
  readonly rho: number
  private readonly s: Float64Array
  private readonly mu: readonly number[]
  private readonly jump: readonly (readonly number[])[]
  private readonly decay: readonly number[]

  constructor(
    p: HawkesParams,
    private readonly rng: Rng,
  ) {
    this.k = p.mu.length
    this.rho = spectralRadius(branchingMatrix(p))
    if (!(this.rho < 1)) throw new Error(`Hawkes process is not stationary: spectral radius ${this.rho}`)
    this.mu = p.mu
    this.jump = p.jump
    this.decay = p.decay
    this.s = new Float64Array(this.k * this.k)
    this.counts = new Array<number>(this.k).fill(0)
  }

  intensity(i: number): number {
    let l = this.mu[i]!
    for (let j = 0; j < this.k; j++) l += this.s[i * this.k + j]!
    return l
  }

  total(): number {
    let l = 0
    for (let i = 0; i < this.k; i++) l += this.intensity(i)
    return l
  }

  private decayTo(t: number) {
    const dt = t - this.t
    if (dt > 0) {
      for (let j = 0; j < this.k; j++) {
        const f = Math.exp(-this.decay[j]! * dt)
        for (let i = 0; i < this.k; i++) this.s[i * this.k + j]! *= f
      }
    }
    this.t = t
  }

  /**
   * Advance to `tEnd`, calling `onEvent` for every event in order. A candidate
   * past `tEnd` is discarded and the clock stops at `tEnd`: the exponential is
   * memoryless, so restarting the thinning there is still exact.
   */
  run(tEnd: number, onEvent: (t: number, type: number) => void): void {
    for (;;) {
      const bound = this.total()
      const tc = this.t + expo(this.rng, bound)
      if (tc > tEnd) {
        this.decayTo(tEnd)
        return
      }
      this.decayTo(tc)
      const lam = this.total()
      if (this.rng() * bound > lam) continue
      let u = this.rng() * lam
      let type = this.k - 1
      for (let i = 0; i < this.k; i++) {
        u -= this.intensity(i)
        if (u < 0) {
          type = i
          break
        }
      }
      for (let i = 0; i < this.k; i++) this.s[i * this.k + type]! += this.jump[i]![type]!
      this.counts[type]!++
      onEvent(tc, type)
    }
  }
}
