import { MODEL, bsCall, normals4, stepCoefficients } from './mc'

/**
 * /market's futures: one-year paths of geometric Brownian motion from the
 * market's own price, at its own realized volatility, drawn from the home
 * figure's counter-based generator with the home figure's model (one year,
 * 64 steps, its rate and seed) — so for the same price and volatility they are
 * the home page's futures, path for path (tests/futures-fan.test.ts). It lives
 * with the futures, not the market: it is drawn from the market and never
 * feeds back into it, and it keeps the home figure's own arithmetic (the
 * platform's exponential), where lib/market computes with its own, the same
 * to the bit in every engine.
 *
 * `begin` sets a fan going; `work` draws paths in slices, so the worker can
 * spread a fan over its frames; once every path is drawn the bands are
 * ready: the 5th, 25th, 50th, 75th and 95th percentiles at every step, a
 * sample of whole paths to draw, and the at-the-money call's price and
 * standard error beside Black–Scholes at the same volatility.
 */
export const FAN = {
  quantiles: [0.05, 0.25, 0.5, 0.75, 0.95],
  /** Whole paths kept to draw. */
  strands: 48,
  /** Paths a fan draws. */
  paths: 4096,
} as const

const STEPS = MODEL.steps
/** Steps whose percentiles one slice sorts, once every path is drawn: eight slices for the fan's 64. */
const SORT_SLICE = 8
const z = new Float64Array(4)

export class Fan {
  private s0 = MODEL.s0
  private sigma = MODEL.sigma
  private n = 0
  private drawn = 0
  /** Every path's price at every step after today, a column a step. */
  private cols: Float64Array[] = []
  private readonly bands = new Float64Array(FAN.quantiles.length * (STEPS + 1))
  private readonly kept = new Float64Array(FAN.strands * (STEPS + 1))
  private sum = 0
  private sum2 = 0
  private sumS = 0
  private sumS2 = 0
  private ready = false
  /** Steps whose percentiles are taken. */
  private sorted = 0
  private col = new Float64Array(0)

  /** Start a fan of `n` paths from price `s0` at volatility `sigma`. */
  begin(s0: number, sigma: number, n: number = FAN.paths): void {
    this.s0 = s0
    this.sigma = sigma
    this.n = n
    this.drawn = 0
    this.sum = this.sum2 = this.sumS = this.sumS2 = 0
    this.ready = false
    this.sorted = 0
    if (!this.cols.length || this.cols[0]!.length !== n) this.cols = Array.from({ length: STEPS }, () => new Float64Array(n))
  }

  /** Paths drawn so far. */
  get progress(): number {
    return this.drawn
  }

  /**
   * Draw up to `budget` more paths, or once all are drawn, take the next steps' percentiles (a sort of every path at
   * each, eight steps a call); true once the fan is whole and its bands are ready.
   */
  work(budget: number): boolean {
    if (this.ready) return true
    if (this.drawn === this.n) return this.finish()
    const { drift, vol } = stepCoefficients(this.sigma)
    const disc = Math.exp(-MODEL.r * MODEL.T)
    const end = Math.min(this.n, this.drawn + budget)
    for (let id = this.drawn; id < end; id++) {
      // The home figure's walk (lib/futures/mc.ts, path), in the same order, so the same numbers.
      let x = 0
      for (let g = 0; g < STEPS / 4; g++) {
        normals4(id, g, z, MODEL.seed)
        for (let k = 0; k < 4; k++) {
          x += drift + vol * z[k]!
          this.cols[g * 4 + k]![id] = this.s0 * Math.exp(x)
        }
      }
      const sT = this.cols[STEPS - 1]![id]!
      const pay = disc * Math.max(sT - this.s0, 0)
      this.sum += pay
      this.sum2 += pay * pay
      this.sumS += sT
      this.sumS2 += sT * sT
      if (id < FAN.strands) {
        const o = id * (STEPS + 1)
        this.kept[o] = this.s0
        for (let s = 0; s < STEPS; s++) this.kept[o + s + 1] = this.cols[s]![id]!
      }
    }
    this.drawn = end
    return false
  }

  private finish(): boolean {
    const Q = FAN.quantiles
    if (this.sorted === 0) for (let b = 0; b < Q.length; b++) this.bands[b * (STEPS + 1)] = this.s0
    if (this.col.length !== this.n) this.col = new Float64Array(this.n)
    const col = this.col
    const end = Math.min(STEPS, this.sorted + SORT_SLICE)
    for (let s = this.sorted; s < end; s++) {
      col.set(this.cols[s]!)
      col.sort()
      // Between two paths, the quantile is taken in log price, where the walk is linear in σ: so a fan at one
      // volatility maps exactly onto the fan at another (lib/market/views.ts, fanAt).
      for (let b = 0; b < Q.length; b++) {
        const at = Q[b]! * (this.n - 1)
        const i = Math.floor(at), f = at - i
        this.bands[b * (STEPS + 1) + s + 1] = i + 1 < this.n && f > 0 ? col[i]! * Math.exp(Math.log(col[i + 1]! / col[i]!) * f) : col[i]!
      }
    }
    this.sorted = end
    this.ready = end === STEPS
    return this.ready
  }

  /** The `b`-th quantile's price at `step` (0 is today). */
  band(b: number, step: number): number {
    return this.bands[b * (STEPS + 1) + step]!
  }

  /** Every band, a row a quantile, today first. */
  bandsData(): Float64Array {
    return this.bands
  }

  /** Path `id` as the fan drew it, today first. */
  path(id: number): Float64Array {
    const out = new Float64Array(STEPS + 1)
    out[0] = this.s0
    for (let s = 0; s < STEPS; s++) out[s + 1] = this.cols[s]![id]!
    return out
  }

  /** The kept paths to draw, a row a path, today first. */
  strands(): Float64Array {
    return this.kept
  }

  /** The at-the-money call a year out: the fan's price and its standard error, and Black–Scholes at the same volatility. */
  call(): { mean: number; se: number; exact: number } {
    const n = this.drawn
    const mean = this.sum / n
    return { mean, se: Math.sqrt(Math.max(0, this.sum2 / n - mean * mean) / n), exact: bsCall(this.s0, this.s0, MODEL.T, MODEL.r, this.sigma) }
  }

  /** The mean price a year out, and its standard error. */
  terminalMean(): { mean: number; se: number } {
    const n = this.drawn
    const mean = this.sumS / n
    return { mean, se: Math.sqrt(Math.max(0, this.sumS2 / n - mean * mean) / n) }
  }
}
