import { spring } from '../stage/spring'
import { dexp, dlog } from './detmath'

/**
 * The arithmetic of /market's views (components/figures/market/): pure, so Node tests it
 * (tests/market-views.test.ts), and in the engine's own exponential and logarithm, as all of lib/market is.
 */

/**
 * The order book's price window: 36 ticks either side of its centre. The centre holds while the price stays in the
 * window's middle three fifths, and follows it out on a spring (ω 5, critically damped), so the price's calm wander
 * (6 ticks in twenty seconds at the median, 18 at most) moves nothing, and a shock's fall (8 to 51 ticks) carries the
 * view down with it; it is never let within a tenth of the window's edge.
 */
export const WINDOW = { half: 36, band: 0.6, clamp: 0.9, omega: 5 } as const

export class PriceWindow {
  centre: number
  private readonly s = { x: 0, v: 0 }

  constructor(mid: number) {
    this.centre = mid
    this.s.x = mid
  }

  step(mid: number, dt: number): void {
    const edge = WINDOW.band * WINDOW.half
    const off = mid - this.s.x
    const target = off > edge ? mid - edge : off < -edge ? mid + edge : this.s.x
    if (target !== this.s.x || this.s.v !== 0) spring(this.s, target, dt, WINDOW.omega)
    const most = WINDOW.clamp * WINDOW.half
    if (mid - this.s.x > most) this.s.x = mid - most
    else if (this.s.x - mid > most) this.s.x = mid + most
    // Settled within a thousandth of a tick and all but still: there.
    if (Math.abs(target - this.s.x) < 1e-3 && Math.abs(this.s.v) < 1e-3) {
      this.s.x = target
      this.s.v = 0
    }
    this.centre = this.s.x
  }
}

/** A queue's tone, 0 to 1: 1 − e^(−q/28), so the median queue (10 shares) is drawn a third of the way, one of 90 all but full. */
export const HEAT = { q: 28, full: 90 } as const
export const heat = (q: number) => (q > 0 ? 1 - dexp(-q / HEAT.q) : 0)
/** How much indigo a queue puts over the paper, by day and by night: a trace for any queue at all, then its tone. */
export const tone = (q: number) => (q > 0 ? 0.05 + 0.9 * heat(q) : 0)

/**
 * A fan drawn at volatility `base.sigma`, as it is at `sigma`: the same paths, the same normal draws, stretched. In
 * log price a path is its drift, (r − σ²/2) a step of `dt` years, plus σ√dt times a sum of normals at each step, so
 * every path, and every quantile taken in log price (lib/futures/fan.ts), maps exactly: nothing is drawn again, and
 * the fan can move with the volatility frame by frame. `r` and `dt` are the fan's own (the worker sends them with it,
 * lib/futures/mc.ts's MODEL), so the page needs no Monte Carlo code to do it. Rows of 65 steps, today first;
 * `outBands` and `outStrands` take the result.
 */
export function fanAt(
  base: { sigma: number; r: number; dt: number; bands: ArrayLike<number>; strands: ArrayLike<number> },
  sigma: number,
  outBands: Float64Array,
  outStrands: Float64Array,
): void {
  const step = (s: number) => ({ drift: (base.r - 0.5 * s * s) * base.dt, vol: s * Math.sqrt(base.dt) })
  const a = step(base.sigma), b = step(sigma)
  const k = b.vol / a.vol
  const map = (src: ArrayLike<number>, out: Float64Array) => {
    for (let i = 0; i < src.length; i++) {
      const j = i % 65
      out[i] = j === 0 ? src[i]! : dexp(j * b.drift + k * (dlog(src[i]!) - j * a.drift))
    }
  }
  map(base.bands, outBands)
  map(base.strands, outStrands)
}

/**
 * A price's own queue as the heat strip tones it, the depth heatmap's convention: the shares resting there, 1 −
 * e^(−q/45) over a trace for any queue at all, so the median queue (10 shares) is light and one of 45 past half; never
 * full. The book at now beside the strip keeps the depth (every share between a price and the touch), the depth chart's.
 */
export const LEVEL = { shares: 45, floor: 0.04, range: 0.86 } as const
export const levelTone = (q: number) => (q > 0 ? LEVEL.floor + LEVEL.range * (1 - dexp(-q / LEVEL.shares)) : 0)

/**
 * The queue at price `j` of the row `age` rows back (0 the newest, `rows` of them), averaged with the rows either side
 * of it in time, those there are: a quarter second of rows, so orders that rest read as bands and a single row's churn
 * does not flicker. `at(age, j)` is the queue there.
 */
export function smoothedQueue(at: (age: number, j: number) => number, age: number, j: number, rows: number): number {
  let sum = 0, n = 0
  for (let a = age - 1; a <= age + 1; a++)
    if (a >= 0 && a < rows) {
      sum += at(a, j)
      n++
    }
  return n ? sum / n : 0
}

/** Seconds of the book the heat strip shows, and the width of the book at now beside it, in CSS pixels. */
export const SPAN = 20
export const LADDER = 56
/** A year's futures are drawn between these multiples of the price now: the fan's bottom and top. */
export const FAN_RANGE = { lo: 1 / 3, hi: 3 } as const

/** Price ticks (in ticks) across `lo`…`hi` at a round step: three to six of them. */
export function priceTicks(lo: number, hi: number): number[] {
  const span = hi - lo
  const step = [10, 20, 25, 50, 100, 200, 250, 500].find((s) => span / s <= 5) ?? 1000
  const out: number[] = []
  for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) out.push(p)
  return out
}

/** A year's prices to mark, in dollars: halvings and doublings of $100 within `lo`…`hi` times the price now. */
export function logTicks(mid: number, lo: number, hi: number): number[] {
  return [6.25, 12.5, 25, 50, 100, 200, 400, 800, 1600].filter((p) => p >= mid * lo * 0.98 && p <= mid * hi * 1.02)
}
