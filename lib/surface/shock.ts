import { CALM, type Params } from './ssvi'

/**
 * A simulated volatility shock, as a path through SSVI parameter space.
 *
 * Nothing here is a market episode. It is the textbook shape of one: a sudden
 * sell-off lifts short-dated at-the-money volatility much more than long-dated
 * (the term structure inverts, and κ rises so the lift is concentrated at the
 * front), ρ moves more negative so every smile tilts harder toward low strikes
 * (crash protection is bid), and then all of it relaxes. Every snapshot along
 * the way is a complete, static SSVI surface; tests/surface-dynamics.test.ts checks both
 * static no-arbitrage conditions at hundreds of them, at every shock size the
 * slider allows.
 *
 * Synthetic throughout: the calm end is the site's hand-set parameters and the
 * shock deltas below are chosen by hand.
 */

/** How far each parameter moves at a full-size shock (amplitude 1, size 1). */
export const SHOCK = {
  /** Short-end ATM vol: 26% → 52%. */
  s0: 0.26,
  /** Long-run ATM vol: 19% → 22%. */
  s1: 0.03,
  /** Decay rate: 1.5 → 4 per year, so the lift sits at the front. */
  kappa: 2.5,
  /** Skew: −0.62 → −0.78. */
  rho: -0.16,
} as const

/**
 * Curvature is capped so Gatheral and Jacquier's sufficient condition
 * η(1 + |ρ|) ≤ 2 (with γ = ½) keeps holding as ρ steepens, with a margin.
 */
export const ETA_CAP = 1.96

export const SIZE_MIN = 0.25
export const SIZE_MAX = 1.5

/** The SSVI parameters at shock amplitude `a` ∈ [0, 1] for a shock of `size`. */
export function params(a: number, size = 1): Params {
  const s = Math.max(0, a) * size
  const rho = CALM.rho + SHOCK.rho * s
  return {
    s0: CALM.s0 + SHOCK.s0 * s,
    s1: CALM.s1 + SHOCK.s1 * s,
    kappa: CALM.kappa + SHOCK.kappa * s,
    rho,
    eta: Math.min(CALM.eta, ETA_CAP / (1 + Math.abs(rho))),
    gamma: CALM.gamma,
  }
}

/** What the surface is doing, in words (components/figures/surface/Live.tsx says which, from the story or the slider). */
export type Phase = 'shock' | 'relax' | 'calm'

/** Each phase in words: its name, the line under the figure, and the line's first sentence, for the stage itself. */
export const PHASE_TEXT: Record<Phase, { name: string; line: string; short: string }> = {
  calm: {
    name: 'Calm',
    line: 'Options are priced for modest swings. Insurance against a crash already costs a little more than the rest.',
    short: 'Options are priced for modest swings.',
  },
  shock: {
    name: 'Shock',
    line: 'Prices drop fast. Everyone wants crash insurance at once, and near-term protection jumps in price.',
    short: 'Prices drop fast.',
  },
  relax: {
    name: 'Fear fades',
    line: 'The panic drains out. Near-term prices sink back; the long end barely moved.',
    short: 'The panic drains out.',
  },
}
