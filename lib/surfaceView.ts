import { black, FORWARD } from './bs'
import { DOMAIN, iv, localVol } from './svi'

/**
 * What the hero figure shows, independent of how it is drawn. The server
 * poster, the client figure and the WebGL renderer all read this, so the
 * contour levels in the flat map are the contour lines on the 3D surface and
 * the readouts in the margin are the same numbers either way.
 */

export interface Probe {
  /** Log-moneyness, log(K/F). */
  readonly k: number
  /** Years. */
  readonly T: number
}

/** Where the probe starts: at the money, six months out. */
export const PROBE_START: Probe = { k: 0, T: 0.5 }

/**
 * Contour levels, in volatility. Every two points through the body of the
 * surface, every five up the steep short-dated downside, where lines two
 * points apart would merge into a smear.
 */
export const LEVELS = [0.18, 0.2, 0.22, 0.24, 0.26, 0.28, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55] as const
export const LABELLED = new Set<number>([0.2, 0.24, 0.3, 0.4, 0.5])

/** Strike ticks as a fraction of the forward, and expiry ticks in years. */
export const STRIKE_TICKS = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3] as const
export const EXPIRY_TICKS = [0.25, 0.5, 1, 1.5, 2] as const

export function expiryLabel(T: number): string {
  const months = T * 12
  if (months < 11.5) return `${Math.round(months)}M`
  return Number.isInteger(T) ? `${T}Y` : `${months.toFixed(0)}M`
}

export const clampProbe = (p: Probe): Probe => ({
  k: Math.min(DOMAIN.kMax, Math.max(DOMAIN.kMin, p.k)),
  T: Math.min(DOMAIN.tMax, Math.max(DOMAIN.tMin, p.T)),
})

/** Keyboard steps: 1/28 of the strike range, 1/19 of the expiry range. */
export const STEP = {
  k: (DOMAIN.kMax - DOMAIN.kMin) / 28,
  T: (DOMAIN.tMax - DOMAIN.tMin) / 19,
} as const

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`
const signed = (x: number, d: number) => `${x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}`

export interface ReadoutRow {
  readonly id: string
  readonly label: string
  readonly value: string
}

/** Everything the margin says about one point on the surface. */
export function readout(p: Probe): readonly ReadoutRow[] {
  const K = FORWARD * Math.exp(p.k)
  const sigma = iv(p.k, p.T)
  const g = black(FORWARD, K, p.T, sigma)
  const months = p.T * 12
  return [
    { id: 'strike', label: 'Strike', value: `${K.toFixed(1)} · ${pct(K / FORWARD, 0)} of F` },
    { id: 'expiry', label: 'Expiry', value: months < 23.95 ? `${months.toFixed(1)} months` : `${p.T.toFixed(2)} years` },
    { id: 'iv', label: 'Implied vol', value: pct(sigma) },
    { id: 'lv', label: 'Local vol', value: pct(localVol(p.k, p.T)) },
    { id: 'call', label: 'Call price', value: g.call.toFixed(2) },
    { id: 'delta', label: 'Delta', value: g.delta.toFixed(3) },
    { id: 'gamma', label: 'Gamma', value: g.gamma.toFixed(4) },
    { id: 'vega', label: 'Vega, per vol pt', value: g.vega.toFixed(3) },
    { id: 'theta', label: 'Theta, per day', value: signed(g.theta, 4) },
  ]
}

/** One sentence for the live region: short enough to hear on every step. */
export function announce(p: Probe): string {
  const K = FORWARD * Math.exp(p.k)
  const sigma = iv(p.k, p.T)
  const g = black(FORWARD, K, p.T, sigma)
  return `Strike ${K.toFixed(0)}, ${expiryLabel(p.T)}: implied volatility ${pct(sigma)}, delta ${g.delta.toFixed(2)}.`
}

/** A fraction as a whole percentage, for labels. */
export const wholePct = (x: number) => `${Math.round(x * 100)}%`
/** A fraction as a CSS percentage, for positioning. */
export const cssPct = (x: number) => `${x * 100}%`
