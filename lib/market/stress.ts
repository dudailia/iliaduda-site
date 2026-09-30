import { dexp } from './detmath'

/**
 * The market's stress, s ∈ [0, 1]: how far the market is from calm, read the
 * way a trader reads it, and what drives the vol surface's shock on /market
 * (lib/market/surface.ts). Four signals, each nothing across the calm
 * market's own range and all at its far end:
 * - selling pressure: the market sells' intensity, which the model knows
 *   exactly, against their stationary rate, past 1.6 × (the calm market's
 *   99.9th percentile is 1.47 ×, its largest 1.71 ×, over five seeds of ten
 *   minutes, every quantum), all at 2.2 ×: the one signal that answers
 *   within the quantum, as implied volatility answers a crash at once while
 *   realised volatility trails;
 * - realised volatility (σ̂) past 1.2 × a calm 25% a year (the calm market's
 *   median is 25.7%, its 95th percentile 29.4%, over five seeds of ten
 *   simulated minutes), all at 4 ×: a liquidity shock lifts σ̂ 1.4 to 5.6 ×
 *   within ten seconds (median 2.8 ×, over twenty seeds, in
 *   tests/market-shock.test.ts), and a σ̂ that fades over minutes should
 *   carry the surface's slow return, not pin it at the full shock;
 * - a spread wider than two ticks (a calm market is at one tick nearly
 *   always), all at seven;
 * - the book drained at the touch: the shares within three ticks of the best
 *   price on its thinner side, below 45 (the calm market's 5th percentile is
 *   48, its median 101, sampled twelve times a simulated second), all when
 *   none are left. The thinner side, because a crash drains one side and the
 *   other, untouched, would hide it in a total.
 * They combine as an "or", s = 1 − (1 − p)(1 − a)(1 − b)(1 − c): any one of
 * them alone can carry the market to full stress, and more than one
 * compounds. The result is smoothed on a 0.35 s half-life, so a single
 * quantum's spike does not jolt the surface, and a shock passes 0.8 within a
 * second (tests/market-shock.test.ts).
 * tests/market-stress.test.ts holds it to all of this.
 */
export const STRESS = {
  pressureFrom: 1.6,
  pressureTo: 2.2,
  sigma0: 0.25,
  volFrom: 1.2,
  volTo: 4,
  spreadFrom: 2,
  spreadTo: 7,
  touchFloor: 45,
  halfLife: 0.35,
} as const

/** Clamped to [0, 1], a NaN counting as nothing. */
const unit = (x: number) => (x > 0 ? (x < 1 ? x : 1) : 0)

/**
 * The stress of a market whose market sells arrive at `pressure` times their stationary rate, with realised
 * volatility `sigma`, a spread of `spread` ticks and `touch` shares on the thinner side near the touch.
 */
export function stressOf(pressure: number, sigma: number, spread: number, touch: number): number {
  const p = unit((pressure - STRESS.pressureFrom) / (STRESS.pressureTo - STRESS.pressureFrom))
  const a = unit((sigma / STRESS.sigma0 - STRESS.volFrom) / (STRESS.volTo - STRESS.volFrom))
  const b = unit((spread - STRESS.spreadFrom) / (STRESS.spreadTo - STRESS.spreadFrom))
  const c = unit(1 - touch / STRESS.touchFloor)
  return 1 - (1 - p) * (1 - a) * (1 - b) * (1 - c)
}

/** The stress, smoothed: it follows its input on a 0.35 s half-life. */
export class Stress {
  s = 0
  private dt = 0
  private k = 0

  update(raw: number, dt: number): void {
    // The engine's own exponential (lib/market/detmath.ts), so every browser smooths it to the same bits.
    if (dt !== this.dt) {
      this.dt = dt
      this.k = 1 - dexp((-dt * Math.LN2) / STRESS.halfLife)
    }
    this.s += (unit(raw) - this.s) * this.k
  }
}
