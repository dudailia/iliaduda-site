import { describe, expect, it } from 'vitest'
import { Lean } from '@/lib/futures/tilt'

/**
 * A phone's tilt leans the view, the way the pointer does on a laptop. The
 * first reading is the reader's natural grip, not a tilt; a new grip held for
 * a while becomes the new neutral, so the figure does not stay leaning; the
 * axes turn with the screen; and a phone lying flat or tipped past upright
 * says nothing useful, so it is ignored.
 */

describe('the tilt lean', () => {
  it('reads the first grip as neutral', () => {
    const l = new Lean()
    expect(l.read(40, 5, 0)).toEqual({ x: 0, y: 0 })
  })

  it('leans with the tilt from there, on both axes, softly toward full and never past it', () => {
    const l = new Lean()
    l.read(40, 5, 0)
    const right = l.read(40, 15, 0)
    expect(right.x).toBeGreaterThan(0.3)
    expect(right.y).toBeCloseTo(0, 2)
    const back = l.read(52, 5, 0)
    expect(Math.abs(back.y)).toBeGreaterThan(0.3)
    const far = l.read(40, 80, 0)
    expect(far.x).toBeCloseTo(1, 2)
  })

  it('turns its axes with the screen', () => {
    const portrait = new Lean(), landscape = new Lean()
    portrait.read(40, 0, 0)
    landscape.read(40, 0, 90)
    // Tipping the phone forward is a sideways tilt of a screen turned to landscape.
    const p = portrait.read(52, 0, 0), q = landscape.read(52, 0, 90)
    expect(Math.abs(p.y)).toBeGreaterThan(0.3)
    expect(Math.abs(q.x)).toBeGreaterThan(0.3)
    expect(Math.abs(q.y)).toBeLessThan(0.05)
  })

  it('settles into a new grip held for a while', () => {
    const l = new Lean()
    l.read(40, 5, 0)
    let last = l.read(40, 17, 0)
    const first = last.x
    // Ten seconds of readings at 60 Hz, held still in the new grip.
    for (let i = 0; i < 600; i++) last = l.read(40, 17, 0)
    expect(first).toBeGreaterThan(0.4)
    expect(last.x).toBeLessThan(0.1)
  })

  it('ignores a phone lying flat or past upright, and a reading that is missing', () => {
    const l = new Lean()
    l.read(40, 5, 0)
    l.read(40, 15, 0)
    const held = l.read(40, 15, 0)
    expect(l.read(85, 40, 0)).toEqual(held)
    expect(l.read(null, null, 0)).toEqual(held)
  })
})

describe('the tilt by time', () => {
  it('settles a new grip in the same seconds whether the sensor reports 60 or 20 times a second', () => {
    const run = (hz: number) => {
      const l = new Lean()
      l.read(40, 5, 0, 0)
      let last = { x: 0, y: 0 }
      for (let i = 1; i <= 5 * hz; i++) last = l.read(40, 17, 0, (i * 1000) / hz)
      return last.x
    }
    expect(Math.abs(run(60) - run(20))).toBeLessThan(0.02)
  })
})
