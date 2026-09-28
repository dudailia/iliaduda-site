/**
 * The market's stress, s ∈ [0, 1]: how far the market is from calm, read the
 * way a trader reads it, and what drives the vol surface's shock on /market
 * (lib/market/surface.ts). Three signals, each nothing across the calm
 * market's own range and all at its far end:
 * - realised volatility (σ̂) past 1.2 × a calm 25% a year (the calm market's
 *   median is 25.7%, its 95th percentile 29.4%, over five seeds of ten
 *   simulated minutes), all at 2.5 ×;
 * - a spread wider than two ticks (a calm market is at one tick nearly
 *   always), all at seven;
 * - the shares within three ticks of the touch, both sides, drained below
 *   140 (the calm 5th percentile is 147), all when none are left.
 * They combine as an "or", s = 1 − (1 − a)(1 − b)(1 − c): any one of them
 * alone can carry the market to full stress, and more than one compounds.
 * The result is smoothed on a one-second half-life, so a single quantum's
 * spike does not jolt the surface, and a sweep reaches it within a second.
 * tests/market-stress.test.ts holds it to all of this.
 */
export const STRESS = {
  sigma0: 0.25,
  volFrom: 1.2,
  volTo: 2.5,
  spreadFrom: 2,
  spreadTo: 7,
  touchFloor: 140,
  halfLife: 1,
} as const

/** Clamped to [0, 1], a NaN counting as nothing. */
const unit = (x: number) => (x > 0 ? (x < 1 ? x : 1) : 0)

/** The stress of a market with realised volatility `sigma`, a spread of `spread` ticks and `touch` shares near the touch. */
export function stressOf(sigma: number, spread: number, touch: number): number {
  const a = unit((sigma / STRESS.sigma0 - STRESS.volFrom) / (STRESS.volTo - STRESS.volFrom))
  const b = unit((spread - STRESS.spreadFrom) / (STRESS.spreadTo - STRESS.spreadFrom))
  const c = unit(1 - touch / STRESS.touchFloor)
  return 1 - (1 - a) * (1 - b) * (1 - c)
}

/** The stress, smoothed: it follows its input on a one-second half-life. */
export class Stress {
  s = 0

  update(raw: number, dt: number): void {
    const k = 1 - 2 ** (-dt / STRESS.halfLife)
    this.s += (unit(raw) - this.s) * k
  }
}
