import { describe, expect, it } from 'vitest'
import { black, cdf, FORWARD } from '../lib/bs'
import { DOMAIN, g, iv, localVol, P, phi, theta, w, wk, wT } from '../lib/svi'

/**
 * The hero figure is synthetic, which makes it the one figure on the site whose
 * numbers could be anything at all. So the maths is held to the standard the
 * surface claims to meet: no static arbitrage anywhere it is drawn, Greeks
 * that match textbook values, and a local-volatility formula that agrees with
 * an independent route to the same number.
 */

const N = 120
const ks = Array.from({ length: N }, (_, i) => DOMAIN.kMin + ((DOMAIN.kMax - DOMAIN.kMin) * i) / (N - 1))
const Ts = Array.from({ length: N }, (_, j) => DOMAIN.tMin + ((DOMAIN.tMax - DOMAIN.tMin) * j) / (N - 1))

describe('the parameters satisfy the sufficient conditions they are chosen for', () => {
  it('η(1 + |ρ|) ≤ 2 with γ = ½, which implies both butterfly conditions of Gatheral and Jacquier (2014)', () => {
    expect(P.gamma).toBe(0.5)
    expect(P.eta * (1 + Math.abs(P.rho))).toBeLessThanOrEqual(2)
  })

  it('and the two butterfly inequalities hold directly, for every θ the figure reaches and beyond', () => {
    // θφ(θ)(1 + |ρ|) < 4 and θφ(θ)²(1 + |ρ|) ≤ 4 (Gatheral and Jacquier 2014).
    for (let i = 1; i <= 2000; i++) {
      const th = (i / 2000) * 5
      const f = phi(th)
      expect(th * f * (1 + Math.abs(P.rho))).toBeLessThan(4)
      expect(th * f * f * (1 + Math.abs(P.rho))).toBeLessThanOrEqual(4)
    }
  })

  it('ρ is a correlation', () => {
    expect(Math.abs(P.rho)).toBeLessThan(1)
  })
})

describe('no static arbitrage anywhere the figure draws', () => {
  it('butterfly: Durrleman g(k) ≥ 0 on the whole grid, and well beyond it', () => {
    let worst = Infinity
    for (const T of Ts) for (let i = 0; i < 400; i++) worst = Math.min(worst, g(-2 + (3 * i) / 399, T))
    expect(worst).toBeGreaterThan(0)
  })

  it('calendar: total variance never decreases with expiry at any strike', () => {
    for (const k of ks) for (const T of Ts) expect(wT(k, T)).toBeGreaterThan(0)
  })

  it('the at-the-money total variance is θ(T), and θ increases', () => {
    for (let j = 1; j < Ts.length; j++) {
      expect(w(0, Ts[j]!)).toBeCloseTo(theta(Ts[j]!), 12)
      expect(theta(Ts[j]!)).toBeGreaterThan(theta(Ts[j - 1]!))
    }
  })

  it('looks like an equity index: downward skew at every expiry', () => {
    for (const T of Ts) expect(wk(0, T).dk).toBeLessThan(0)
    expect(iv(-0.3, 0.25)).toBeGreaterThan(iv(0, 0.25))
    expect(iv(0.2, 0.25)).toBeLessThan(iv(0, 0.25))
  })

  it('stays in a range a reader would recognise', () => {
    for (const k of ks)
      for (const T of Ts) {
        expect(iv(k, T)).toBeGreaterThan(0.08)
        expect(iv(k, T)).toBeLessThan(0.6)
      }
  })
})

describe('the analytic k-derivatives match finite differences', () => {
  it('∂w/∂k and ∂²w/∂k²', () => {
    const h = 1e-5
    for (const k of [-0.4, -0.1, 0, 0.2]) {
      for (const T of [0.1, 0.5, 1.5]) {
        const d = wk(k, T)
        expect(d.dk).toBeCloseTo((w(k + h, T) - w(k - h, T)) / (2 * h), 7)
        expect(d.dkk).toBeCloseTo((w(k + h, T) - 2 * w(k, T) + w(k - h, T)) / (h * h), 3)
      }
    }
  })
})

describe('Black on a forward, r = q = 0', () => {
  it('the normal distribution function is accurate in the tails', () => {
    expect(cdf(0)).toBe(0.5)
    expect(cdf(1.96)).toBeCloseTo(0.9750021048517795, 12)
    expect(cdf(-3)).toBeCloseTo(0.0013498980316301, 14)
  })

  it('matches the textbook at-the-money case: F = K = 100, T = 1, σ = 20%', () => {
    const r = black(100, 100, 1, 0.2)
    // C = 100·(N(0.1) − N(−0.1))
    expect(r.call).toBeCloseTo(7.965567455405804, 10)
    expect(r.put).toBeCloseTo(r.call, 10) // put–call parity at the money, r = 0
    expect(r.delta).toBeCloseTo(0.539827837277029, 12)
    expect(r.gamma).toBeCloseTo(0.01984762737385059, 12) // φ(0.1)/20
    expect(r.vega).toBeCloseTo(0.39695254747701, 12)
    expect(r.theta * 365).toBeCloseTo(-3.9695254747701, 10)
  })

  it('satisfies put–call parity away from the money', () => {
    for (const K of [70, 95, 130]) {
      const r = black(FORWARD, K, 0.75, 0.23)
      expect(r.call - r.put).toBeCloseTo(FORWARD - K, 10)
    }
  })

  it('each Greek is the derivative it claims to be', () => {
    const F = 100, K = 104, T = 0.4, s = 0.21, h = 1e-4
    const r = black(F, K, T, s)
    expect(r.delta).toBeCloseTo((black(F + h, K, T, s).call - black(F - h, K, T, s).call) / (2 * h), 7)
    expect(r.gamma).toBeCloseTo((black(F + h, K, T, s).call - 2 * r.call + black(F - h, K, T, s).call) / (h * h), 3)
    expect(r.vega).toBeCloseTo((black(F, K, T, s + h).call - black(F, K, T, s - h).call) / (2 * h) / 100, 7)
    expect(r.theta).toBeCloseTo(-(black(F, K, T + h, s).call - black(F, K, T - h, s).call) / (2 * h) / 365, 7)
  })
})

describe('local volatility', () => {
  it('agrees with Dupire in prices: σ² = 2·∂C/∂T / (K²·∂²C/∂K²)', () => {
    // An independent route to the same number: build call prices from the
    // surface, differentiate them numerically, and compare.
    const F = FORWARD
    const C = (K: number, T: number) => black(F, K, T, iv(Math.log(K / F), T)).call
    for (const [K, T] of [[90, 0.5], [100, 1], [110, 0.25], [80, 1.5]] as const) {
      const hT = 1e-4, hK = 1e-2
      const dCdT = (C(K, T + hT) - C(K, T - hT)) / (2 * hT)
      const d2CdK2 = (C(K + hK, T) - 2 * C(K, T) + C(K - hK, T)) / (hK * hK)
      const dupire = Math.sqrt((2 * dCdT) / (K * K * d2CdK2))
      expect(localVol(Math.log(K / F), T)).toBeCloseTo(dupire, 3)
    }
  })

  it('is steeper than implied volatility on the downside, as skew implies', () => {
    expect(localVol(-0.2, 0.5)).toBeGreaterThan(iv(-0.2, 0.5))
  })
})
