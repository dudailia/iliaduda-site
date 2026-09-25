import { CALM, type Params } from './ssvi'

/**
 * A simulated volatility shock, as a path through SSVI parameter space.
 *
 * Nothing here is a market episode. It is the textbook shape of one: a sudden
 * sell-off lifts short-dated at-the-money volatility much more than long-dated
 * (the term structure inverts, and κ rises so the lift is concentrated at the
 * front), ρ moves more negative so every smile tilts harder toward low strikes
 * (crash protection is bid), and then all of it relaxes. Every snapshot along
 * the way is a complete, static SSVI surface; tests/lab-c.test.ts checks both
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

// ── the clock ────────────────────────────────────────────────────────────────

/** Seconds. The loop begins with the shock. */
export const RISE = 1.0
export const RELAX = 6.0
export const HOLD = 3.0
export const LOOP = RISE + RELAX + HOLD
/** Relaxation time constant: most of the fear is gone in three of these. */
export const TAU = 1.5
/** Where the poster is drawn and where the live loop starts: the peak. */
export const PEAK = RISE

/** A CSS cubic-bezier, solved for y at x = t by bisection. */
export function bezier(x1: number, y1: number, x2: number, y2: number) {
  const b = (u: number, p1: number, p2: number) => 3 * u * (1 - u) * (1 - u) * p1 + 3 * u * u * (1 - u) * p2 + u * u * u
  return (t: number) => {
    if (t <= 0) return 0
    if (t >= 1) return 1
    let lo = 0, hi = 1
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2
      if (b(mid, x1, x2) < t) lo = mid
      else hi = mid
    }
    return b((lo + hi) / 2, y1, y2)
  }
}
/** Strong ease-out: the shock lands at once and settles into its peak. */
export const easeOut = bezier(0.23, 1, 0.32, 1)

export type Phase = 'shock' | 'relax' | 'calm'

/** Shock amplitude at loop time `t` seconds: a fast rise, an exponential relaxation that reaches zero exactly, a calm hold. */
/** Time constant of the critically damped relaxation, seconds. */
const RELAX_T = 0.9

export function amplitude(t: number): number {
  const u = ((t % LOOP) + LOOP) % LOOP
  if (u < RISE) return easeOut(u / RISE)
  if (u < RISE + RELAX) {
    // Critically damped, so the fall starts at zero speed exactly where the
    // rise ends: a plain exponential left the peak at full speed, and the
    // surface visibly hit the ceiling and dropped. Half-life ≈ 1.5s; it is
    // under 0.04 by about 4.5s and reaches zero exactly at the end.
    const x = u - RISE
    const d = (y: number) => (1 + y / RELAX_T) * Math.exp(-y / RELAX_T)
    const end = d(RELAX)
    return (d(x) - end) / (1 - end)
  }
  return 0
}

export function phase(t: number): Phase {
  const u = ((t % LOOP) + LOOP) % LOOP
  // "Shock" covers the rise and the first moments at the top, so the word is
  // on screen long enough to be read.
  if (u < RISE + 0.9) return 'shock'
  if (amplitude(u) > 0.04) return 'relax'
  return 'calm'
}

export const PHASE_TEXT: Record<Phase, { name: string; line: string }> = {
  calm: {
    name: 'Calm',
    line: 'Options price in modest swings. Insurance against a crash already costs a little more than the rest.',
  },
  shock: {
    name: 'Shock',
    line: 'Prices drop fast. Everyone wants crash insurance at once, and near-term protection jumps in price.',
  },
  relax: {
    name: 'Fear fades',
    line: 'The panic drains out. Near-term prices sink back; the long end barely moved.',
  },
}
