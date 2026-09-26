import { describe, expect, it } from 'vitest'
import { BURST, SEQ_MS, SKIP_MS, Timeline, isSkipInput, phaseAt, type Phases } from '@/lib/futures/sequence'

/**
 * The home figure's one orchestrated moment: the futures burst out of today,
 * land in the histogram, the histogram becomes payoff × probability, and the
 * price settles. These pin the choreography's contract — when each phase may
 * move, that each only moves forward, that pausing (no frames while off
 * screen) pauses it, and that a reader's input finishes it quickly instead of
 * cutting it — and which inputs count as the reader asking to skip.
 */

const all = (p: Phases) => [p.burst, p.landing, p.morph, p.price]

describe('phaseAt', () => {
  it('is all zeros at the start and all ones at the end', () => {
    expect(all(phaseAt(0))).toEqual([0, 0, 0, 0])
    expect(all(phaseAt(3600))).toEqual([1, 1, 1, 1])
  })

  it('clamps outside the sequence', () => {
    expect(all(phaseAt(-1))).toEqual([0, 0, 0, 0])
    expect(all(phaseAt(1e9))).toEqual([1, 1, 1, 1])
  })

  it('only ever moves each phase forward', () => {
    let prev = phaseAt(0)
    for (let ms = 10; ms <= 3600; ms += 10) {
      const p = phaseAt(ms)
      for (const k of ['burst', 'landing', 'morph', 'price'] as const) expect(p[k]).toBeGreaterThanOrEqual(prev[k])
      prev = p
    }
  })

  it('opens the phases in story order: paths, then landing, then the morph, then the price', () => {
    // The morph waits for a histogram worth morphing; the price waits for the payoff bars.
    expect(phaseAt(1).burst).toBeGreaterThan(0)
    expect(phaseAt(1872).morph).toBe(0)
    expect(phaseAt(1900).morph).toBeGreaterThan(0)
    expect(phaseAt(2592).price).toBe(0)
    expect(phaseAt(2620).price).toBeGreaterThan(0)
  })

  it('fills the histogram from the moment the first future reaches expiry', () => {
    // Inside the burst, the first strand launches at once and its front takes
    // BURST.front of the burst to arrive; nothing can have landed before then.
    const burstMs = SEQ_MS * 0.34
    const firstLanding = burstMs * BURST.front
    expect(firstLanding).toBeGreaterThan(300)
    expect(phaseAt(firstLanding - 1).landing).toBe(0)
    expect(phaseAt(firstLanding + 20).landing).toBeGreaterThan(0)
    // Every strand has launched by BURST.launch of the burst and landed by its end.
    expect(BURST.launch + BURST.front).toBeCloseTo(1, 9)
    // The last future lands before the histogram has finished filling.
    expect(phaseAt(burstMs).landing).toBeLessThan(1)
  })

  it('finishes the burst before the morph starts, and the landing before the price', () => {
    expect(phaseAt(1872).burst).toBe(1)
    expect(phaseAt(2592).landing).toBe(1)
  })

  it('lasts three to four seconds', () => {
    expect(SEQ_MS).toBeGreaterThanOrEqual(3000)
    expect(SEQ_MS).toBeLessThanOrEqual(4000)
  })
})

describe('Timeline', () => {
  it('does not move before it is started', () => {
    const t = new Timeline()
    t.advance(1000)
    expect(all(t.phases())).toEqual([0, 0, 0, 0])
    expect(t.started).toBe(false)
  })

  it('advances additively, so frame rate cannot change the choreography', () => {
    const a = new Timeline()
    const b = new Timeline()
    a.start()
    b.start()
    for (let i = 0; i < 180; i++) a.advance(10)
    b.advance(1800)
    expect(a.phases()).toEqual(b.phases())
  })

  it('ignores negative time', () => {
    const t = new Timeline()
    t.start()
    t.advance(500)
    const before = t.phases()
    t.advance(-200)
    expect(t.phases()).toEqual(before)
  })

  it('is done at the end of the sequence', () => {
    const t = new Timeline()
    t.start()
    t.advance(3599)
    expect(t.done).toBe(false)
    t.advance(1)
    expect(t.done).toBe(true)
    expect(all(t.phases())).toEqual([1, 1, 1, 1])
  })

  it('on skip, plays what is left in a quarter of a second rather than cutting', () => {
    const t = new Timeline()
    t.start()
    t.advance(1500)
    t.skip()
    // Not a cut: the frame after the skip is not yet the end.
    t.advance(16)
    expect(t.done).toBe(false)
    const mid = t.phases()
    expect(mid.morph).toBeGreaterThan(phaseAt(1500).morph)
    t.advance(SKIP_MS)
    expect(t.done).toBe(true)
    expect(all(t.phases())).toEqual([1, 1, 1, 1])
  })

  it('skips within a quarter of a second from any point, and a second skip changes nothing', () => {
    for (const at of [0, 400, 2000, 3500]) {
      const t = new Timeline()
      t.start()
      t.advance(at)
      t.skip()
      t.advance(SKIP_MS / 2)
      t.skip()
      t.advance(SKIP_MS / 2)
      expect(t.done, `skipped at ${at}ms`).toBe(true)
    }
    expect(SKIP_MS).toBeLessThanOrEqual(300)
  })

  it('ignores a skip before it has started: the reader has not seen it yet', () => {
    // On a phone the hero is below the masthead; a tap up there must not
    // spend the sequence before the reader scrolls down to it.
    const t = new Timeline()
    t.skip()
    expect(t.done).toBe(false)
    t.start()
    t.advance(1000)
    expect(all(t.phases())).toEqual(all(phaseAt(1000)))
  })

  it('replays from the beginning', () => {
    const t = new Timeline()
    t.start()
    t.advance(3600)
    t.replay()
    expect(t.done).toBe(false)
    expect(all(t.phases())).toEqual([0, 0, 0, 0])
    t.advance(3600)
    expect(t.done).toBe(true)
  })
})

describe('isSkipInput', () => {
  it('counts a click, a key press and a mouse or pen press', () => {
    expect(isSkipInput({ type: 'click' })).toBe(true)
    expect(isSkipInput({ type: 'keydown', key: 'a' })).toBe(true)
    expect(isSkipInput({ type: 'keydown', key: 'Enter' })).toBe(true)
    expect(isSkipInput({ type: 'keydown', key: 'Tab' })).toBe(true)
    expect(isSkipInput({ type: 'pointerdown', pointerType: 'mouse' })).toBe(true)
    expect(isSkipInput({ type: 'pointerdown', pointerType: 'pen' })).toBe(true)
  })

  it('does not count scrolling, or a finger that may only be starting a scroll', () => {
    expect(isSkipInput({ type: 'wheel' })).toBe(false)
    expect(isSkipInput({ type: 'scroll' })).toBe(false)
    expect(isSkipInput({ type: 'touchmove' })).toBe(false)
    expect(isSkipInput({ type: 'touchstart' })).toBe(false)
    expect(isSkipInput({ type: 'pointerdown', pointerType: 'touch' })).toBe(false)
  })

  it('does not count a modifier key pressed on its own', () => {
    for (const key of ['Shift', 'Meta', 'Control', 'Alt']) expect(isSkipInput({ type: 'keydown', key })).toBe(false)
  })
})
