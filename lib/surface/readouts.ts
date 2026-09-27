import { black, FORWARD } from '@/lib/bs'
import { check, iv, type Check, type Params } from './ssvi'

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

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`

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
    premium: `+${(n.premium * 100).toFixed(1)} pts`,
    put: `${pct(n.put, 2)} of price`,
    arb: c.passes ? 'passes' : 'fails',
    arbDetail: `min g ${c.minG.toFixed(3)}, ${c.points.toLocaleString('en-US')} pts`,
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
