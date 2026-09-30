import { describe, expect, it } from 'vitest'
import { black, FORWARD } from '../lib/bs'
import { localVol as calmLocalVol } from '../lib/svi'
import { pointRows } from '../lib/surface/readouts'
import { params } from '../lib/surface/shock'
import { CALM, iv, localVol, type Params } from '../lib/surface/ssvi'

/**
 * What the margin of the IV paper's Fig. 1 reads at the probe, from the
 * parameters on screen: implied and local volatility, a call and its Greeks.
 * The surface moves (the shock), so each is checked at calm, at the peak of a
 * full shock and at the largest shock the slider allows: local volatility
 * against Dupire in call prices, an independent route, and every Greek
 * against a finite difference of the price.
 */

const F = FORWARD
const POINTS = [
  [90, 0.5],
  [100, 1],
  [110, 0.25],
  [80, 1.5],
  [95, 1 / 12],
] as const

describe.each([
  ['calm', CALM],
  ['the peak of a full shock', params(1)],
  ['the largest shock', params(1, 1.5)],
] as const)('at %s', (_, p: Params) => {
  it('local volatility is Dupire’s: the total-variance form agrees with call prices, σ² = 2·∂C/∂T / (K²·∂²C/∂K²)', () => {
    const C = (K: number, T: number) => black(F, K, T, iv(p, Math.log(K / F), T)).call
    for (const [K, T] of POINTS) {
      const hT = Math.min(1e-4, T / 20), hK = 1e-2
      const dCdT = (C(K, T + hT) - C(K, T - hT)) / (2 * hT)
      const d2CdK2 = (C(K + hK, T) - 2 * C(K, T) + C(K - hK, T)) / (hK * hK)
      const dupire = Math.sqrt((2 * dCdT) / (K * K * d2CdK2))
      expect(localVol(p, Math.log(K / F), T) / dupire - 1).toBeCloseTo(0, 2)
    }
  })

  it('the margin’s Greeks are the price’s finite differences, σ held at the point’s own implied volatility', () => {
    const h = 1e-3
    for (const [K, T] of POINTS) {
      const k = Math.log(K / F)
      const s = iv(p, k, T)
      const rows = Object.fromEntries(pointRows(p, { k, T }).map((r) => [r.id, r.value]))
      const C = (f: number, t: number, v: number) => black(f, K, t, v).call
      const num = (x: string) => Number(x.replace('−', '-'))
      expect(num(rows.call!)).toBeCloseTo(C(F, T, s), 2)
      expect(num(rows.delta!)).toBeCloseTo((C(F + h, T, s) - C(F - h, T, s)) / (2 * h), 3)
      expect(num(rows.gamma!)).toBeCloseTo((C(F + h, T, s) - 2 * C(F, T, s) + C(F - h, T, s)) / (h * h), 3)
      expect(num(rows.vega!)).toBeCloseTo((C(F, T, s + h) - C(F, T, s - h)) / (2 * h) / 100, 3)
      expect(num(rows.theta!)).toBeCloseTo(-(C(F, T + h / 10, s) - C(F, T - h / 10, s)) / (2 * (h / 10)) / 365, 4)
      expect(rows.iv).toBe(`${(s * 100).toFixed(1)}%`)
      expect(rows.lv).toBe(`${(localVol(p, k, T) * 100).toFixed(1)}%`)
    }
  })
})

describe('local volatility against implied', () => {
  const EXPIRIES = [1 / 12, 0.25, 0.5, 1, 2]
  it('at calm runs above implied on the downside, where the skew compounds, and below it at the money, where the term structure falls', () => {
    for (const T of EXPIRIES) {
      expect(localVol(CALM, -0.2, T)).toBeGreaterThan(iv(CALM, -0.2, T))
      expect(localVol(CALM, 0, T)).toBeLessThan(iv(CALM, 0, T))
    }
  })
  it('at the peak of a full shock falls further below implied at the money, at every expiry: the inverted term structure prices less variance ahead', () => {
    const gap = (p: Params, T: number) => iv(p, 0, T) - localVol(p, 0, T)
    for (const T of EXPIRIES) expect(gap(params(1), T)).toBeGreaterThan(gap(CALM, T))
  })
})

describe('the moving surface at calm is the paper’s own', () => {
  it('local volatility at the calm parameters is lib/svi.ts’s, to rounding', () => {
    for (const [K, T] of POINTS) expect(localVol(CALM, Math.log(K / F), T)).toBeCloseTo(calmLocalVol(Math.log(K / F), T), 12)
  })
})
