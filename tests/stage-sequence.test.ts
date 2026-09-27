import { describe, expect, it } from 'vitest'
import { SKIP_MS, Sequence } from '@/lib/stage/sequence'

/**
 * Every figure's signature moment runs on one clock with the hero's rules:
 * phases open on their windows and only move forward; frames not drawn are
 * time not passed; a reader's click finishes what is left in a quarter of a
 * second on the strong ease-out instead of cutting it, but only once a frame of
 * it has been seen; using the figure ends it at once; and Replay starts over.
 */

const make = () => new Sequence(2000, { rise: [0, 0.6], river: [0.2, 0.5], settle: [0.5, 1] })

describe('a signature sequence', () => {
  it('opens each phase on its window, clamped, and only moves forward', () => {
    const s = make()
    s.start()
    expect(s.phases()).toEqual({ rise: 0, river: 0, settle: 0 })
    let prev = s.phases()
    for (let i = 0; i < 200; i++) {
      s.advance(10)
      const p = s.phases()
      for (const k of ['rise', 'river', 'settle'] as const) expect(p[k]).toBeGreaterThanOrEqual(prev[k])
      prev = p
    }
    expect(s.phases()).toEqual({ rise: 1, river: 1, settle: 1 })
    expect(s.done).toBe(true)
  })

  it('does not move before it starts, nor on time that was not drawn', () => {
    const s = make()
    s.advance(500)
    expect(s.started).toBe(false)
    expect(s.phases().rise).toBe(0)
    s.start()
    s.advance(-50)
    s.advance(0)
    expect(s.phases().rise).toBe(0)
  })

  it('is additive, so the frame rate cannot change it', () => {
    const a = make(), b = make()
    a.start()
    b.start()
    for (let i = 0; i < 90; i++) a.advance(10)
    b.advance(900)
    expect(a.phases()).toEqual(b.phases())
  })

  it('on a skip plays what is left in a quarter of a second, and a skip before its first frame spends nothing', () => {
    const s = make()
    s.start()
    s.skip()
    s.advance(16)
    expect(s.done).toBe(false)
    expect(s.phases().rise).toBeLessThan(0.05)
    s.advance(600)
    s.skip()
    s.advance(16)
    expect(s.done).toBe(false)
    s.advance(SKIP_MS)
    expect(s.done).toBe(true)
  })

  it('says while a skip plays how far through it is, and where it began', () => {
    const s = make()
    s.start()
    expect(s.skipping()).toBe(null)
    s.advance(700)
    const at = s.phases()
    s.skip()
    expect(s.skipping()).toEqual({ u: 0, from: at })
    s.advance(SKIP_MS / 2)
    expect(s.skipping()!.u).toBeCloseTo(0.5, 9)
    expect(s.skipping()!.from).toEqual(at)
    s.advance(SKIP_MS)
    expect(s.done).toBe(true)
    expect(s.skipping()).toBe(null)
    s.replay()
    expect(s.skipping()).toBe(null)
  })

  it('finishes at once when the reader uses the figure, and replays from the start', () => {
    const s = make()
    s.finish()
    expect(s.done).toBe(true)
    expect(s.phases()).toEqual({ rise: 1, river: 1, settle: 1 })
    s.replay()
    expect(s.done).toBe(false)
    expect(s.phases().rise).toBe(0)
    expect(s.started).toBe(true)
  })

  it('refuses a window outside the sequence', () => {
    expect(() => new Sequence(1000, { a: [0.5, 0.4] })).toThrow()
    expect(() => new Sequence(1000, { a: [-0.1, 0.4] })).toThrow()
  })
})
