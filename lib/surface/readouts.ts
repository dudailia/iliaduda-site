import { black, FORWARD } from '@/lib/bs'
import { check, iv, localVol, type Check, type Params } from './ssvi'

/**
 * What the readouts under the surface say, computed from the parameters on
 * screen. The server calls this for the poster's frame and the client for
 * every drawn frame, so a number never lags the picture it describes.
 */

export const ONE_MONTH = 1 / 12

export interface Numbers {
  /** At-the-money implied volatility, one month. */
  readonly atm: number
  /** 80%-strike minus at-the-money implied volatility, one month, in volatility units. */
  readonly premium: number
  /** A one-month put struck 10% below the forward, as a fraction of the forward (Black, r = 0). */
  readonly put: number
}

export function numbers(p: Params): Numbers {
  const atm = iv(p, 0, ONE_MONTH)
  const low = iv(p, Math.log(0.8), ONE_MONTH)
  const s90 = iv(p, Math.log(0.9), ONE_MONTH)
  const put = black(FORWARD, 0.9 * FORWARD, ONE_MONTH, s90).put / FORWARD
  return { atm, premium: low - atm, put }
}

/** A fraction as a percentage, to `d` decimals (one by default). */
export const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`

export interface Text {
  readonly atm: string
  readonly premium: string
  readonly put: string
  readonly arb: string
  readonly arbDetail: string
}

export function text(n: Numbers, c: Check): Text {
  return {
    atm: pct(n.atm),
    premium: `+${(n.premium * 100).toFixed(1)} vol pts`,
    put: `${pct(n.put, 2)} of price`,
    arb: c.passes ? 'passes' : 'fails',
    arbDetail: `min g ${c.minG.toFixed(3)}, on\u00a0${c.points.toLocaleString('en-US')}\u00a0grid\u00a0points`,
  }
}

export function all(p: Params): Text {
  return text(numbers(p), check(p))
}

/** A point on the surface, in words. */
export function probeText(p: Params, k: number, T: number): { where: string; vol: string } {
  const K = Math.exp(k)
  const m = T * 12
  const when = m < 11.5 ? `${m.toFixed(m < 3 ? 1 : 0)} months` : `${T.toFixed(1)} years`
  return { where: `strike ${Math.round(K * 100)}%, ${when}`, vol: pct(iv(p, k, T)) }
}

export interface Row {
  readonly id: string
  readonly label: string
  readonly value: string
}

const signed = (x: number, d: number) => `${x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}`

/**
 * Everything the margin says about one point on the surface, from the parameters on screen: where it is, its
 * implied and local volatility, and a call on Black's formula with its Greeks. Greeks are sticky-strike: σ is held
 * at the point's own implied volatility while each is taken.
 */
export function pointRows(p: Params, at: { k: number; T: number }): readonly Row[] {
  const K = FORWARD * Math.exp(at.k)
  const sigma = iv(p, at.k, at.T)
  const b = black(FORWARD, K, at.T, sigma)
  const months = at.T * 12
  return [
    { id: 'strike', label: 'Strike', value: `${K.toFixed(1)} · ${pct(K / FORWARD, 0)}\u00a0of\u00a0forward` },
    { id: 'expiry', label: 'Expiry', value: months < 23.95 ? `${months.toFixed(1)} months` : `${at.T.toFixed(2)} years` },
    { id: 'iv', label: 'Implied vol', value: pct(sigma) },
    { id: 'lv', label: 'Local vol', value: pct(localVol(p, at.k, at.T)) },
    { id: 'call', label: 'Call price', value: b.call.toFixed(2) },
    { id: 'delta', label: 'Delta', value: b.delta.toFixed(3) },
    { id: 'gamma', label: 'Gamma', value: b.gamma.toFixed(4) },
    { id: 'vega', label: 'Vega, per vol pt', value: b.vega.toFixed(3) },
    { id: 'theta', label: 'Theta, per day', value: signed(b.theta, 4) },
  ]
}
