import { EASE_IN_OUT, EASE_OUT } from '../ease'
import { Sequence } from '../stage/sequence'

/**
 * The IV paper's signature moment: the surface forming, then taking one
 * volatility shock. Lines of constant expiry draw in across the strikes, from
 * the shortest expiry back to the longest; the sheet rises into them from the
 * floor; the axis labels arrive; then one full-size shock lands on the site's
 * in-out curve (lib/surface/shock.ts: the short end lifts, the skew
 * steepens, the term structure inverts) and drains away, critically damped,
 * to exactly nothing. Every frame along the way is a complete SSVI surface
 * free of static arbitrage (tests/surface-dynamics.test.ts). After it, nothing
 * loops: the surface rests at calm and the shock is the reader's, on the
 * slider.
 */

export const FORM_MS = 5000

export const surfaceSequence = () =>
  new Sequence(FORM_MS, {
    lines: [0, 0.2],
    rise: [0.12, 0.32],
    labels: [0.24, 0.36],
    shock: [0.32, 0.56],
    relax: [0.56, 1],
  })

/** How many relaxation times the relax window holds: by its end the fear is gone to under 3% before the last step to zero. */
const RELAX_TIMES = 5.5
const damped = (x: number) => (1 + x) * Math.exp(-x)
const END = damped(RELAX_TIMES)

/**
 * The shock's amplitude along the signature: onto the peak on the in-out
 * curve, then off it critically damped, leaving the peak at zero speed (so
 * the turn has no kink) and reaching exactly zero at the end.
 */
export function amplitudeOf(p: { shock: number; relax: number }): number {
  if (p.shock < 1) return EASE_IN_OUT(p.shock)
  return (damped(p.relax * RELAX_TIMES) - END) / (1 - END)
}

/** Of the lines phase, the share the reveal takes to sweep from the shortest expiry to the longest, and each line's share. */
const SWEEP = 0.6
const EACH = 0.4

/** How much of the line at expiry position `v` (0 the shortest, 1 the longest) is drawn, `lines` (0…1) into its phase. */
export function lineReveal(lines: number, v: number): number {
  const u = Math.min(1, Math.max(0, (lines - v * SWEEP) / EACH))
  return EASE_OUT(u)
}
