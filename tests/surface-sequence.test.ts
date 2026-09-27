import { describe, expect, it } from 'vitest'
import { FORM_MS, amplitudeOf, lineReveal, shownAmplitude, surfaceSequence } from '../lib/surface/sequence'

/**
 * The IV paper's signature: the surface forms, then takes one volatility
 * shock and relaxes to calm. Lines of constant expiry draw in from the short
 * end to the long; the sheet rises into them; the shock lands on the site's
 * in-out curve and drains away to exactly nothing. Then nothing loops.
 */

const at = (ms: number) => {
  const s = surfaceSequence()
  s.start()
  s.advance(ms)
  return s.phases()
}

describe('the IV surface’s signature', () => {
  it('lasts about five seconds and ends where the reader takes over: calm', () => {
    expect(FORM_MS).toBeGreaterThanOrEqual(4000)
    expect(FORM_MS).toBeLessThanOrEqual(5500)
    expect(amplitudeOf(at(FORM_MS))).toBe(0)
  })

  it('draws the lines first, raises the sheet into them, and only then shocks it', () => {
    const p = at(FORM_MS * 0.12)
    expect(p.lines).toBeGreaterThan(0)
    expect(p.rise).toBeLessThan(0.1)
    expect(amplitudeOf(p)).toBe(0)
    const q = at(FORM_MS * 0.33)
    expect(q.lines).toBe(1)
    expect(q.rise).toBe(1)
    expect(amplitudeOf(q)).toBeLessThan(0.05)
  })

  it('takes the full shock once, and relaxes from it without a jump to exactly nothing', () => {
    let peak = 0, peakAt = 0, prev = 0, biggestStep = 0
    for (let ms = 0; ms <= FORM_MS; ms += 10) {
      const a = amplitudeOf(at(ms))
      if (a > peak) {
        peak = a
        peakAt = ms
      }
      biggestStep = Math.max(biggestStep, Math.abs(a - prev))
      prev = a
    }
    expect(peak).toBeCloseTo(1, 6)
    expect(peakAt).toBeGreaterThan(FORM_MS * 0.4)
    expect(peakAt).toBeLessThan(FORM_MS * 0.65)
    // Continuous: no 10 ms step moves it more than the in-out curve's own steepest does (about 4%).
    expect(biggestStep).toBeLessThan(0.05)
    // And the turn at the peak has no kink: onto it and off it, both at zero speed.
    expect(amplitudeOf({ shock: 1, relax: 0 })).toBe(1)
    expect(1 - amplitudeOf({ shock: 1, relax: 0.002 })).toBeLessThan(1e-3)
    expect(1 - amplitudeOf({ shock: 0.998, relax: 0 })).toBeLessThan(1e-3)
  })

  it('reveals each line of constant expiry in turn, from the shortest expiry to the longest', () => {
    const p = at(FORM_MS * 0.08)
    expect(lineReveal(p.lines, 0)).toBeGreaterThan(lineReveal(p.lines, 0.5))
    expect(lineReveal(p.lines, 0.5)).toBeGreaterThanOrEqual(lineReveal(p.lines, 1))
    expect(lineReveal(1, 1)).toBe(1)
    expect(lineReveal(0, 0)).toBe(0)
  })

  it('never shows a shock a skip passed over: from wherever the reader skips, the shock only drains, to exactly nothing', () => {
    for (let ms = 50; ms < FORM_MS; ms += 50) {
      const s = surfaceSequence()
      s.start()
      s.advance(ms)
      const before = shownAmplitude(s)
      expect(before).toBe(amplitudeOf(s.phases()))
      s.skip()
      let prev = shownAmplitude(s)
      expect(prev).toBe(before)
      while (!s.done) {
        s.advance(1000 / 60)
        const a = shownAmplitude(s)
        expect(a).toBeLessThanOrEqual(prev + 1e-12)
        prev = a
      }
      expect(shownAmplitude(s)).toBe(0)
    }
  })
})
