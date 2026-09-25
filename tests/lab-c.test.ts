import { describe, expect, it } from 'vitest'
import * as svi from '../lib/svi'
import { amplitude, ETA_CAP, LOOP, params, PEAK, phase, RELAX, RISE, SIZE_MAX, SIZE_MIN } from '../lib/lab/c/shock'
import { CALM, check, DOMAIN, g, gjRatio, iv, phi, theta, w, wk, wT, type Params } from '../lib/lab/c/ssvi'
import { numbers, probeText, text } from '../lib/lab/c/readouts'
import { poster, describe as describePoster } from '../lib/lab/c/poster'
import { camera, fitDistance, FRAME, kOfU, mvp, apply, tOfV, fu, fv } from '../lib/lab/c/view'
import { diffuse, UP_LIGHT } from '../lib/lab/c/look'

/**
 * Prototype C animates a synthetic SSVI surface through a volatility shock.
 * A moving surface is a claim at every frame, so the claim is checked at
 * hundreds of them: both static no-arbitrage conditions, at every shock size
 * the slider allows, across the whole loop.
 */

const PHASES = Array.from({ length: 240 }, (_, i) => (i / 240) * LOOP)
const SIZES = [SIZE_MIN, 0.5, 1, 1.25, SIZE_MAX]
const Ts = Array.from({ length: 48 }, (_, j) => DOMAIN.tMin + ((DOMAIN.tMax - DOMAIN.tMin) * j) / 47)
const ksWide = Array.from({ length: 160 }, (_, i) => -1.5 + (2.5 * i) / 159)

describe('the parametrised SSVI is lib/svi.ts at the calm parameters', () => {
  it('θ, φ, w, its k-derivatives, g and ∂w/∂T agree to rounding', () => {
    for (const T of [1 / 12, 0.1, 0.5, 1, 2])
      for (const k of [-0.4, -0.1, 0, 0.2, 0.3]) {
        expect(theta(CALM, T)).toBeCloseTo(svi.theta(T), 14)
        expect(phi(CALM, theta(CALM, T))).toBeCloseTo(svi.phi(svi.theta(T)), 12)
        expect(w(CALM, k, T)).toBeCloseTo(svi.w(k, T), 14)
        const a = wk(CALM, k, T), b = svi.wk(k, T)
        expect(a.dk).toBeCloseTo(b.dk, 12)
        expect(a.dkk).toBeCloseTo(b.dkk, 10)
        expect(g(CALM, k, T)).toBeCloseTo(svi.g(k, T), 12)
        expect(wT(CALM, k, T)).toBeCloseTo(svi.wT(k, T), 9)
        expect(iv(CALM, k, T)).toBeCloseTo(svi.iv(k, T), 14)
      }
  })

  it('amplitude 0 is the calm surface, for any shock size', () => {
    for (const s of SIZES) expect(params(0, s)).toEqual(CALM)
  })
})

describe('the shock path', () => {
  it('rises fast, relaxes to exactly zero, holds calm', () => {
    expect(amplitude(0)).toBe(0)
    expect(amplitude(RISE)).toBeCloseTo(1, 12)
    // Strong ease-out: most of the rise lands in the first third.
    expect(amplitude(RISE / 3)).toBeGreaterThan(0.75)
    expect(amplitude(RISE + RELAX)).toBeCloseTo(0, 12)
    expect(amplitude(RISE + RELAX + 0.5)).toBe(0)
    // Monotone on the way up and on the way down.
    for (let t = 0.01; t < RISE; t += 0.01) expect(amplitude(t)).toBeGreaterThanOrEqual(amplitude(t - 0.01))
    for (let t = RISE + 0.01; t < RISE + RELAX; t += 0.01) expect(amplitude(t)).toBeLessThanOrEqual(amplitude(t - 0.01))
  })

  it('the poster is drawn at the peak, and the loop is continuous across its seam', () => {
    expect(PEAK).toBe(RISE)
    expect(phase(PEAK)).toBe('shock')
    expect(Math.abs(amplitude(LOOP - 1e-6) - amplitude(0))).toBeLessThan(1e-9)
  })

  it('a shock steepens the skew and inverts the term structure', () => {
    const calm = params(0), peak = params(1)
    expect(peak.rho).toBeLessThan(calm.rho)
    expect(iv(peak, 0, 1 / 12)).toBeGreaterThan(iv(peak, 0, 2))
    expect(iv(calm, Math.log(0.8), 1 / 12) - iv(calm, 0, 1 / 12)).toBeLessThan(iv(peak, Math.log(0.8), 1 / 12) - iv(peak, 0, 1 / 12))
    // The long end moves much less than the front.
    expect(iv(peak, 0, 2) - iv(calm, 0, 2)).toBeLessThan((iv(peak, 0, 1 / 12) - iv(calm, 0, 1 / 12)) / 3)
  })
})

describe('no static arbitrage at any phase of the loop, at any shock size', { timeout: 30_000 }, () => {
  const each = (fn: (p: Params) => void) => {
    for (const s of SIZES) for (const t of PHASES) fn(params(amplitude(t), s))
  }

  it('Gatheral and Jacquier: η(1 + |ρ|) ≤ 2 with γ = ½, and both butterfly inequalities directly, for every θ', () => {
    each((p) => {
      expect(p.gamma).toBe(0.5)
      expect(Math.abs(p.rho)).toBeLessThan(1)
      expect(p.eta * (1 + Math.abs(p.rho))).toBeLessThanOrEqual(ETA_CAP + 1e-12)
    })
    for (const s of SIZES)
      for (const t of PHASES.filter((_, i) => i % 6 === 0)) {
        const p = params(amplitude(t), s)
        for (let i = 1; i <= 400; i++) expect(gjRatio(p, (i / 400) * 6)).toBeLessThan(1)
      }
  })

  it('butterfly: Durrleman g(k) ≥ 0 on a dense grid far wider than the drawn strikes', () => {
    let worst = Infinity
    for (const s of SIZES)
      for (const t of PHASES.filter((_, i) => i % 3 === 0)) {
        const p = params(amplitude(t), s)
        for (const T of Ts) for (const k of ksWide) worst = Math.min(worst, g(p, k, T))
      }
    expect(worst).toBeGreaterThan(0)
  })

  it('calendar: total variance rises with expiry at every strike', () => {
    for (const s of SIZES)
      for (const t of PHASES.filter((_, i) => i % 3 === 0)) {
        const p = params(amplitude(t), s)
        for (const k of ksWide.filter((_, i) => i % 4 === 0)) for (const T of Ts) expect(wT(p, k, T)).toBeGreaterThan(0)
      }
  })

  it('the live check agrees, and would catch a violation', () => {
    each((p) => expect(check(p, 25, 16).passes).toBe(true))
    // A surface pushed past the bound: η well beyond 2/(1+|ρ|) makes the density negative.
    const broken = { ...params(1), eta: 3.2 }
    expect(check(broken).passes).toBe(false)
    expect(check(broken).minG).toBeLessThan(0)
  })

  it('stays in a range a reader would recognise', () => {
    each((p) => {
      for (const T of [DOMAIN.tMin, 0.5, DOMAIN.tMax])
        for (const k of [DOMAIN.kMin, 0, DOMAIN.kMax]) {
          expect(iv(p, k, T)).toBeGreaterThan(0.12)
          expect(iv(p, k, T)).toBeLessThan(1.1)
        }
    })
  })
})

describe('the readouts are the maths', () => {
  it('at the peak: numbers match a direct computation', () => {
    const p = params(1)
    const n = numbers(p)
    expect(n.atm).toBeCloseTo(iv(p, 0, 1 / 12), 14)
    expect(n.premium).toBeCloseTo(iv(p, Math.log(0.8), 1 / 12) - iv(p, 0, 1 / 12), 14)
    expect(n.put).toBeGreaterThan(0)
    const t = text(n, check(p))
    expect(t.arb).toBe('passes')
    expect(t.atm).toMatch(/^\d+\.\d%$/)
  })

  it('move with the shock: the crash premium and the put cost more at the peak than in calm', () => {
    const calm = numbers(params(0)), peak = numbers(params(1))
    expect(peak.atm).toBeGreaterThan(calm.atm * 1.5)
    expect(peak.premium).toBeGreaterThan(calm.premium)
    expect(peak.put).toBeGreaterThan(calm.put * 2)
  })

  it('a point reads its own implied volatility', () => {
    const p = params(0.5)
    expect(probeText(p, 0, 0.25)).toEqual({ where: 'strike 100%, 3 months', vol: `${(iv(p, 0, 0.25) * 100).toFixed(1)}%` })
  })
})

describe('the view', () => {
  it('√T layout and its inverse round-trip', () => {
    for (const x of [0, 0.25, 0.5, 1]) {
      expect(fu(kOfU(x))).toBeCloseTo(x, 12)
      expect(fv(tOfV(x))).toBeCloseTo(x, 12)
    }
  })

  it('the camera fits the whole solid in frame at every sway angle', () => {
    {
      expect(fitDistance()).toBeGreaterThan(1)
      for (const s of [-1, 0, 1]) {
        const m = mvp(camera(s))
        for (const [x, y, z] of [[-1.35, 1.05, -0.85], [1.35, 0, 0.85], [-1.35, 0, 0.85]] as const) {
          const q = apply(m, x, y, z)
          expect(Math.abs(q[0] / q[3])).toBeLessThanOrEqual(1)
          expect(Math.abs(q[1] / q[3])).toBeLessThanOrEqual(1)
        }
      }
      expect(FRAME.aspect).toBeGreaterThan(0)
    }
  })

  it('an upward-facing patch is lit at exactly its ramp colour', () => {
    expect(diffuse([0, 1, 0])).toBeCloseTo(1, 12)
    expect(UP_LIGHT).toBeGreaterThan(0)
  })
})

describe('the poster', () => {
  it('is a modest amount of markup: one picture serves every screen', () => {
    {
      const d = poster(params(amplitude(PEAK)))
      const bytes = d.css.length + d.runs.reduce((a, r) => a + r.d.length + r.cls.length + 24, 0) + d.lines.reduce((a, l) => a + l.d.length + l.c.length + 60, 0)
      expect(bytes).toBeLessThan(40_000)
      expect(d.runs.length).toBeGreaterThan(50)
      expect(d.labels.every((l) => l.x > -0.05 && l.x < 1.05 && l.y > -0.05 && l.y < 1.05)).toBe(true)
    }
  })

  it('describes its own numbers', () => {
    const p = params(amplitude(PEAK))
    expect(describePoster(p)).toContain(`${Math.round(iv(p, 0, 1 / 12) * 100)}% at the money`)
  })
})
