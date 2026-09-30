import { describe, expect, it } from 'vitest'
import { MARKET_SEQ, marketSequence, punch, storyOf } from '../lib/market/sequence'

/**
 * /market's signature (lib/market/sequence.ts): the market calm for long
 * enough to see its three views move together, then a liquidity shock landing
 * in all three at once, then the model's own recovery. The shock itself is the
 * market's (lib/market/shock.ts); this is only when it lands, what the page
 * says while it does, and the camera's blow.
 */

describe('the market’s signature', () => {
  it('holds the calm for 2.5 seconds, lands the shock then, and tells the recovery for six more', () => {
    const s = marketSequence()
    s.start()
    s.advance(2_499)
    expect(s.phases().land).toBe(0)
    expect(storyOf(s.phases())).toBe('calm')
    s.advance(2)
    expect(s.phases().land).toBeGreaterThan(0)
    expect(storyOf(s.phases())).toBe('shock')
    s.advance(4_000)
    expect(storyOf(s.phases())).toBe('recovery')
    s.advance(10_000)
    expect(s.done).toBe(true)
    expect(MARKET_SEQ.calm + MARKET_SEQ.recovery).toBe(s.total)
  })

  it('lands at once when the reader asks: a click in the calm plays the rest in a quarter of a second', () => {
    const s = marketSequence()
    s.start()
    s.advance(500)
    s.skip()
    s.advance(250)
    expect(s.phases().land).toBe(1)
    expect(s.done).toBe(true)
  })

  it('never lands before it has started, whatever time passes', () => {
    const s = marketSequence()
    s.advance(60_000)
    expect(s.phases().land).toBe(0)
  })

  it('strikes the camera as a blow: in fast, held while the surface lifts, out slowly, and exactly at rest either side', () => {
    expect(punch(-0.1)).toBe(0)
    expect(punch(0)).toBe(0)
    expect(punch(MARKET_SEQ.punch.in)).toBeCloseTo(1, 9)
    expect(punch(MARKET_SEQ.punch.in + MARKET_SEQ.punch.hold / 2)).toBe(1)
    const end = MARKET_SEQ.punch.in + MARKET_SEQ.punch.hold + MARKET_SEQ.punch.out
    expect(punch(end)).toBe(0)
    expect(punch(end + 5)).toBe(0)
    // Up, then down, never past either end.
    let prev = 0, peaked = false
    for (let t = 0; t <= end; t += 0.01) {
      const p = punch(t)
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(1)
      if (p < prev - 1e-12) peaked = true
      if (peaked) expect(p).toBeLessThanOrEqual(prev + 1e-12)
      prev = p
    }
  })
})
