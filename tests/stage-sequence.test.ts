import { describe, expect, it } from 'vitest'
import { SKIP_MS, Sequence, isSkipInput } from '@/lib/stage/sequence'

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

describe('what counts as asking to get on with it', () => {
  // An element inside a Replay control or not, as `closest` finds it for a list of selectors.
  const on = (replay: boolean) => ({ closest: (sel: string) => (replay && sel.split(',').includes('[data-replay]') ? {} : null) })
  it('is not a press on Replay: that starts the story over, it does not ask to finish it', () => {
    expect(isSkipInput({ type: 'pointerdown', pointerType: 'mouse', target: on(true) })).toBe(false)
    expect(isSkipInput({ type: 'click', target: on(true) })).toBe(false)
    expect(isSkipInput({ type: 'keydown', key: 'Enter', target: on(true) })).toBe(false)
  })
  it('is any other click, key or mouse press, wherever it lands', () => {
    expect(isSkipInput({ type: 'pointerdown', pointerType: 'mouse', target: on(false) })).toBe(true)
    expect(isSkipInput({ type: 'click', target: on(false) })).toBe(true)
    expect(isSkipInput({ type: 'click', target: null })).toBe(true)
    expect(isSkipInput({ type: 'keydown', key: 'a' })).toBe(true)
  })
})

describe('a skip', () => {
  it('finishes each phase evenly from where it stood: one still to come does not leap in the first frame', () => {
    const s = new Sequence(5000, { lines: [0, 0.2], rise: [0.2, 0.5], shock: [0.5, 1] })
    s.start()
    s.advance(700)
    expect(s.phases().rise).toBe(0)
    s.skip()
    s.advance(16)
    // 16ms of 240: a fifteenth of the way, not the most of it.
    expect(s.phases().rise).toBeCloseTo(16 / 240, 5)
    expect(s.phases().lines).toBeCloseTo(0.7 + 0.3 * (16 / 240), 5)
    s.advance(240)
    expect(s.done).toBe(true)
    expect(s.phases()).toEqual({ lines: 1, rise: 1, shock: 1 })
  })
})
