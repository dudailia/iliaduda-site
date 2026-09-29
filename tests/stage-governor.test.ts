import { describe, expect, it } from 'vitest'
import { Governor } from '../lib/stage/governor'

/**
 * The stage kit's quality governor (lib/stage/governor.ts), frame by frame. It judges frames against the display's own
 * refresh, which it learns: a 120 Hz laptop, a 60 Hz phone, and a 30 Hz clock (an iPhone in Low Power Mode, a laptop
 * saving energy) are each held at the quality they can draw, and only frames missed against that clock step it down.
 */

/** Runs `seconds` of frames, each lasting what `ms(q)` says at the quality drawn; returns the qualities seen. */
function run(g: Governor, seconds: number, ms: (q: number) => number, from = 0) {
  const seen: number[] = []
  let now = from
  while (now < from + seconds * 1000) {
    const dt = ms(g.q)
    now += dt
    g.frame(dt / 1000, now)
    seen.push(g.q)
  }
  return { seen, now }
}

describe('the quality governor', () => {
  it('holds a steady 60 Hz display at its top quality', () => {
    const g = new Governor(2, 3)
    const { seen } = run(g, 20, () => 1000 / 60)
    expect(Math.min(...seen.slice(-60))).toBe(3)
  })

  it('holds a steady 120 Hz display at its top quality', () => {
    const g = new Governor(2, 3)
    const { seen } = run(g, 20, () => 1000 / 120)
    expect(Math.min(...seen.slice(-120))).toBe(3)
  })

  it('never lets a steady 30 Hz clock take the quality down for good: it learns the clock and climbs back', () => {
    const g = new Governor(2, 3)
    const { seen } = run(g, 20, () => 1000 / 30)
    // The last ten seconds all at the top: the clock set the pace, not the work.
    expect(Math.min(...seen.slice(-300))).toBe(3)
    expect(g.refresh).toBeCloseTo(1000 / 30, 0)
  })

  it('learns a 30 Hz clock within a few seconds, not the ~45 seconds creeping toward it took', () => {
    const g = new Governor(3, 3)
    const { seen } = run(g, 6, () => 1000 / 30)
    expect(seen.at(-1)).toBe(3)
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(2)
  })

  it('still steps down a device that cannot draw its quality: a lower one runs faster, so it stays there', () => {
    const g = new Governor(3, 3)
    // A 60 Hz display on a GPU that needs 30ms a frame at 3 and 22 at 2 (about 45 fps, which it holds).
    const { seen } = run(g, 20, (q) => [1000 / 60, 1000 / 60, 22, 30][q]!)
    expect(Math.max(...seen.slice(-300))).toBeLessThanOrEqual(2)
  })

  it('follows the clock back when it speeds up again (Low Power Mode turned off)', () => {
    const g = new Governor(3, 3)
    const a = run(g, 10, () => 1000 / 30)
    run(g, 10, () => 1000 / 60, a.now)
    expect(g.refresh).toBeCloseTo(1000 / 60, 0)
    expect(g.q).toBe(3)
  })

  it('does not climb while held (a figure mid-story asks it to wait)', () => {
    const g = new Governor(1, 3)
    let now = 0
    for (let i = 0; i < 600; i++) {
      now += 1000 / 60
      g.frame(1 / 60, now, true)
    }
    expect(g.q).toBe(1)
  })
})
