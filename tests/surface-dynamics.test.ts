import { describe, expect, it } from 'vitest'
import * as svi from '../lib/svi'
import { ETA_CAP, params, SIZE_MAX, SIZE_MIN } from '../lib/surface/shock'
import { FORM_MS, amplitudeOf, surfaceSequence } from '../lib/surface/sequence'
import { CALM, check, DOMAIN, g, gjRatio, iv, phi, theta, w, wk, wT, type Params } from '../lib/surface/ssvi'
import { numbers, probeText, text } from '../lib/surface/readouts'
import { FRAME_ASPECT, noteRise } from '../components/figures/surface/marks'
import { poster, describe as describePoster } from '../lib/surface/poster'
import { invert } from '../lib/m4'
import { camera, fitDistance, FRAMES, H, kOfU, labelBox, LABEL_INSET, LABELS, mvp, NARROWEST, apply, pickSurface, tOfV, fu, fv, wx, wy, wz, XW, ZW, type FrameKind } from '../lib/surface/view'
import { diffuse, linOf, oklab, rampLab, srgbOf, UP_LIGHT } from '../lib/surface/look'

/**
 * The IV paper's Fig. 1 moves a synthetic SSVI surface through a volatility
 * shock. A moving surface is a claim at every frame, so the claim is checked
 * at hundreds of them: both static no-arbitrage conditions, at every shock
 * size the slider allows, along the whole of the story's path (its amplitude
 * at 240 moments of lib/surface/sequence.ts), and at the peak.
 */

/** The story's shock amplitude at 240 moments, peak included. */
const AMPS = [
  ...Array.from({ length: 240 }, (_, i) => {
    const s = surfaceSequence()
    s.start()
    s.advance((i / 239) * FORM_MS)
    return amplitudeOf(s.phases())
  }),
  1,
]
/** The peak: a full-size shock. */
const PEAK = 1
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
  it('reaches a full shock and comes back to calm along the story', () => {
    expect(Math.max(...AMPS)).toBeCloseTo(1, 6)
    expect(AMPS[0]).toBe(0)
    expect(AMPS[239]).toBe(0)
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
    for (const s of SIZES) for (const a of AMPS) fn(params(a, s))
  }

  it('Gatheral and Jacquier: η(1 + |ρ|) ≤ 2 with γ = ½, and both butterfly inequalities directly, for every θ', () => {
    each((p) => {
      expect(p.gamma).toBe(0.5)
      expect(Math.abs(p.rho)).toBeLessThan(1)
      expect(p.eta * (1 + Math.abs(p.rho))).toBeLessThanOrEqual(ETA_CAP + 1e-12)
    })
    for (const s of SIZES)
      for (const a of AMPS.filter((_, i) => i % 6 === 0)) {
        const p = params(a, s)
        for (let i = 1; i <= 400; i++) expect(gjRatio(p, (i / 400) * 6)).toBeLessThan(1)
      }
  })

  it('butterfly: Durrleman g(k) ≥ 0 on a dense grid far wider than the drawn strikes', () => {
    let worst = Infinity
    for (const s of SIZES)
      for (const a of AMPS.filter((_, i) => i % 3 === 0)) {
        const p = params(a, s)
        for (const T of Ts) for (const k of ksWide) worst = Math.min(worst, g(p, k, T))
      }
    expect(worst).toBeGreaterThan(0)
  })

  it('calendar: total variance rises with expiry at every strike', () => {
    for (const s of SIZES)
      for (const a of AMPS.filter((_, i) => i % 3 === 0)) {
        const p = params(a, s)
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
      expect(fitDistance('wide')).toBeGreaterThan(1)
      for (const s of [-1, 0, 1]) {
        const m = mvp('wide', camera('wide', s))
        for (const [x, y, z] of [[-1.35, 1.05, -0.85], [1.35, 0, 0.85], [-1.35, 0, 0.85]] as const) {
          const q = apply(m, x, y, z)
          expect(Math.abs(q[0] / q[3])).toBeLessThanOrEqual(1)
          expect(Math.abs(q[1] / q[3])).toBeLessThanOrEqual(1)
        }
      }
      expect(FRAMES.wide.aspect).toBeGreaterThan(0)
    }
  })

  it('a phone has a frame of its own, and on a 390px phone the surface fills most of its width', () => {
    // The solid at calm and at its tallest: the box its corners make, projected into a 390px-wide stage of the
    // frame's own aspect, in CSS pixels.
    const solid = [-1, 1].flatMap((sx) => [[sx * XW, 0, -ZW], [sx * XW, H * 0.6, -ZW], [sx * XW, 0, ZW], [sx * XW, H * 0.3, ZW]] as const)
    const size = (kind: FrameKind) => {
      const a = FRAMES[kind].aspect
      const m = mvp(kind, camera(kind), a)
      const xs = solid.map(([x, y, z]) => apply(m, x, y, z)).map((q) => [q[0] / q[3], q[1] / q[3]] as const)
      const w = ((Math.max(...xs.map((q) => q[0])) - Math.min(...xs.map((q) => q[0]))) / 2) * 390
      const h = ((Math.max(...xs.map((q) => q[1])) - Math.min(...xs.map((q) => q[1]))) / 2) * (390 / a)
      return [w, h]
    }
    expect(FRAMES.tall.aspect).toBeLessThan(FRAMES.wide.aspect)
    const [w, h] = size('tall')
    // Letterboxed into a phone, the wide frame gave it 250 × 146px; its own, with its words inside the page's margin,
    // about 297 × 211px.
    expect(w).toBeGreaterThan(290)
    expect(h).toBeGreaterThan(200)
  })

  it('a point of the surface is found again under where it is drawn, in either framing, calm or shocked', () => {
    for (const kind of ['wide', 'tall'] as const)
      for (const a of [0, 1]) {
        const p = params(a)
        const m = mvp(kind, camera(kind))
        const inv = invert(m)!
        for (const k of [-0.3, -0.1, 0, 0.12, 0.2])
          for (const T of [0.1, 0.4, 1, 1.8]) {
            const q = apply(m, wx(k), wy(iv(p, k, T)), wz(T))
            const got = pickSurface(inv, q[0] / q[3], q[1] / q[3], p)!
            expect(got, `${kind} ${a} ${k} ${T}`).not.toBeNull()
            expect(Math.abs(fu(got.k) - fu(k)), `${kind} ${a} ${k} ${T}`).toBeLessThan(0.01)
            expect(Math.abs(fv(got.T) - fv(T)), `${kind} ${a} ${k} ${T}`).toBeLessThan(0.01)
          }
        // Above the surface, in the sky, there is nothing to read.
        expect(pickSurface(inv, 0, 0.99, p)).toBeNull()
      }
  })

  it('a note’s words stand at their own height above the point, unless that would cross the stage’s top', () => {
    // Room above: the note's own offset.
    expect(noteRise(200, -62, 24)).toBe(-62)
    // The peak risen near the top: the words stop 4px under it, the leader shorter.
    expect(noteRise(50, -62, 24)).toBe(-22)
    // No room above for the words and a 10px leader: they hang 10px below the point instead.
    expect(noteRise(20, -62, 24)).toBe(10)
  })

  it('the stage’s and the frame box’s classes are the two framings’ aspects', () => {
    expect(FRAME_ASPECT).toBe(`aspect-[${FRAMES.tall.aspect}] sm:aspect-[${FRAMES.wide.aspect}]`)
  })

  it('each frame holds the solid, and every one of its labels whole, at every angle its sway reaches', () => {
    for (const kind of ['wide', 'tall'] as const) {
      const box = [-1, 1].flatMap((sx) => [[sx * XW, 0, -ZW], [sx * XW, H, -ZW], [sx * XW, 0, ZW]] as const)
      for (const s of [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]) {
        const m = mvp(kind, camera(kind, s))
        for (const [x, y, z] of box) {
          const q = apply(m, x, y, z)
          expect(q[3], kind).toBeGreaterThan(0)
          expect(Math.abs(q[0] / q[3]), `${kind} ${s}`).toBeLessThanOrEqual(0.93)
          expect(Math.abs(q[1] / q[3]), `${kind} ${s}`).toBeLessThanOrEqual(0.95)
        }
        // The text, not only the anchor, at the narrowest stage the framing is shown on.
        for (const l of LABELS.filter((l) => !l.only || l.only === kind)) {
          const q = apply(m, l.at[0], l.at[1], l.at[2])
          const [x0, x1, y0, y1] = labelBox(kind, l, q[0] / q[3], q[1] / q[3])
          expect(Math.min(x0, y0), `${kind} ${l.id} ${s}`).toBeGreaterThanOrEqual(-0.99)
          expect(Math.max(x1, y1), `${kind} ${l.id} ${s}`).toBeLessThanOrEqual(0.99)
          // Clear of the stage's side by its inset: on a phone, the page's margin.
          const side = 1 - LABEL_INSET[kind] / (NARROWEST[kind] / 2) + 1e-3
          expect(Math.max(-x0, x1), `${kind} ${l.id} ${s} inset`).toBeLessThanOrEqual(side)
        }
      }
    }
  })

  it('the ramp’s colour arithmetic on the CPU is the shader’s: oklab there and back is the colour itself', () => {
    for (const c of [[0.184, 0.227, 0.549], [0.894, 0.902, 0.949], [0.09, 0.094, 0.11], [1, 1, 1]] as const) {
      const back = srgbOf(linOf(oklab(c)))
      for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(c[i]!, 6)
    }
    const stops = { lo: oklab([0.2, 0.3, 0.6]), mid: oklab([0.5, 0.5, 0.7]), top: oklab([0.1, 0.1, 0.4]) }
    expect(rampLab(0, stops)).toEqual(stops.lo)
    expect(rampLab(0.5, stops)).toEqual(stops.mid)
    expect(rampLab(1, stops)).toEqual(stops.top)
  })

  it('an upward-facing patch is lit at exactly its ramp colour', () => {
    expect(diffuse([0, 1, 0])).toBeCloseTo(1, 12)
    expect(UP_LIGHT).toBeGreaterThan(0)
  })
})

describe('the poster', () => {
  it('is a modest amount of markup: one picture serves every screen', () => {
    {
      const d = poster(params(PEAK))
      const bytes = d.css.length + d.runs.reduce((a, r) => a + r.d.length + r.cls.length + 24, 0) + d.lines.reduce((a, l) => a + l.d.length + l.c.length + 60, 0)
      expect(bytes).toBeLessThan(40_000)
      expect(d.runs.length).toBeGreaterThan(50)
      expect(d.labels.every((l) => l.x > -0.05 && l.x < 1.05 && l.y > -0.05 && l.y < 1.05)).toBe(true)
    }
  })

  it('draws each frame from its own camera, with that frame’s labels and notes only', () => {
    for (const kind of ['wide', 'tall'] as const) {
      const d = poster(params(0), kind)
      expect(d.aspect).toBe(FRAMES[kind].aspect)
      expect(d.width).toBe(Math.round(FRAMES[kind].aspect * 1000))
      expect(d.labels.length).toBeGreaterThan(4)
      expect(d.labels.every((l) => !l.only || l.only === kind)).toBe(true)
      expect(d.notes.every((n) => n.kind === kind)).toBe(true)
      expect(d.labels.every((l) => l.x > -0.02 && l.x < 1.02 && l.y > -0.02 && l.y < 1.02)).toBe(true)
    }
  })

  it('describes its own numbers', () => {
    const p = params(PEAK)
    expect(describePoster(p)).toContain(`${Math.round(iv(p, 0, 1 / 12) * 100)}% at the money`)
  })
})
