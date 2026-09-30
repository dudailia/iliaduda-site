import { describe, expect, it } from 'vitest'
import { surfaceOf } from '../lib/market/surface'
import { CALM, check, gjRatio, iv } from '../lib/surface/ssvi'
import { ETA_CAP } from '../lib/surface/shock'

/**
 * /market's vol surface: the IV paper's own shock family (lib/surface/shock.ts),
 * driven by the market's stress instead of the paper's story. At calm it is
 * exactly the /iv-surface paper's calm surface; under stress the short end
 * lifts, the skew steepens and the term structure inverts; and it never
 * leaves the envelope in which the shock family is tested free of static
 * arbitrage.
 */

describe('the stress-driven surface', () => {
  it('is the IV paper’s calm surface at calm, and at no stress below it', () => {
    expect(surfaceOf(0)).toEqual(CALM)
    expect(surfaceOf(-0.3)).toEqual(CALM)
    expect(surfaceOf(Number.NaN)).toEqual(CALM)
  })

  it('lifts one-month at-the-money volatility as stress rises, and stops at a full shock', () => {
    let prev = 0
    for (let s = 0; s <= 1; s += 0.02) {
      const v = iv(surfaceOf(s), 0, 1 / 12)
      expect(v).toBeGreaterThan(prev)
      prev = v
    }
    expect(surfaceOf(1.7)).toEqual(surfaceOf(1))
  })

  it('stays free of static arbitrage at every stress: no butterfly, no calendar spread, and the Gatheral–Jacquier bound held', () => {
    for (let s = 0; s <= 1.0001; s += 0.05) {
      const p = surfaceOf(s)
      const c = check(p)
      expect(c.passes, `stress ${s.toFixed(2)}: min g ${c.minG}, min dw ${c.minDw}`).toBe(true)
      for (let i = 1; i <= 400; i++) expect(gjRatio(p, (i / 400) * 6)).toBeLessThan(1)
      expect(p.eta * (1 + Math.abs(p.rho))).toBeLessThanOrEqual(ETA_CAP + 1e-12)
    }
  })
})
