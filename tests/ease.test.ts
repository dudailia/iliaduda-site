import { describe, expect, it } from 'vitest'
import { EASE_IN_OUT, EASE_IN_OUT_QUAD, EASE_OUT, bezier } from '@/lib/ease'

/**
 * The site's curves, evaluated in JavaScript for motion that is drawn rather
 * than transitioned (WebGL, canvas). They must be the same curves CSS runs, so
 * a canvas morph and a CSS morph on the same page cannot disagree.
 */

describe('bezier', () => {
  it('matches CSS `ease` (cubic-bezier(0.25, 0.1, 0.25, 1)) at its midpoint', () => {
    // The CSS `ease` curve at x = 0.5, a value quoted by the browsers' own
    // implementations: 0.8024.
    expect(bezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024, 3)
  })

  it('is the identity for the linear curve', () => {
    const lin = bezier(0, 0, 1, 1)
    for (const x of [0, 0.1, 0.37, 0.5, 0.9, 1]) expect(lin(x)).toBeCloseTo(x, 6)
  })

  it('starts at 0, ends at 1 and clamps outside [0, 1]', () => {
    for (const f of [EASE_OUT, EASE_IN_OUT, EASE_IN_OUT_QUAD]) {
      expect(f(0)).toBeCloseTo(0, 9)
      expect(f(1)).toBeCloseTo(1, 9)
      expect(f(-0.5)).toBeCloseTo(0, 9)
      expect(f(1.5)).toBeCloseTo(1, 9)
    }
  })

  it('never runs backwards', () => {
    for (const f of [EASE_OUT, EASE_IN_OUT, EASE_IN_OUT_QUAD]) {
      let prev = 0
      for (let x = 0.005; x <= 1; x += 0.005) {
        const y = f(x)
        expect(y).toBeGreaterThanOrEqual(prev - 1e-9)
        prev = y
      }
    }
  })

  it('front-loads the ease-out', () => {
    // Strong ease-out: most of the distance in the first fifth.
    expect(EASE_OUT(0.2)).toBeGreaterThan(0.6)
  })

  it('eases both ends of the in-outs', () => {
    // (0.77, 0, 0.175, 1) is Ceaser's easeInOutQuart: slow away, slow in,
    // and deliberately not symmetric.
    expect(EASE_IN_OUT(0.1)).toBeLessThan(0.02)
    expect(EASE_IN_OUT(0.9)).toBeGreaterThan(0.98)
    // easeInOutQuad is symmetric about the middle.
    expect(EASE_IN_OUT_QUAD(0.5)).toBeCloseTo(0.5, 3)
    expect(EASE_IN_OUT_QUAD(0.2) + EASE_IN_OUT_QUAD(0.8)).toBeCloseTo(1, 3)
    expect(EASE_IN_OUT_QUAD(0.1)).toBeLessThan(0.1)
  })
})
