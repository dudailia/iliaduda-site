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

  it('does not mistake a GPU that holds every heavy frame at 33ms for a 30 Hz clock, once it has seen the display run faster', () => {
    // A 60 Hz phone: its light frames (the figure before its story) come every 16.7ms; at 2 and 1 its GPU holds frames to
    // two refreshes, 33.3ms, steady, which alone would read as Low Power Mode's clock; at 0 it draws in 13ms.
    const g = new Governor(2, 3)
    for (let i = 0; i < 30; i++) g.observe(1000 / 60)
    let now = 0
    const seen: number[] = []
    while (now < 20000) {
      const dt = [13, 1000 / 30, 1000 / 30, 1000 / 30][g.q]!
      // The display's own frames: a 13ms frame shows on the next 60 Hz refresh.
      const shown = Math.ceil(dt / (1000 / 60)) * (1000 / 60)
      now += shown
      g.observe(shown)
      g.frame(shown / 1000, now)
      seen.push(g.q)
    }
    expect(Math.max(...seen.slice(-300))).toBe(0)
    expect(g.refresh).toBeLessThan(20)
  })

  it('still learns a real 30 Hz clock when every frame it sees, light or heavy, is a thirtieth of a second apart', () => {
    const g = new Governor(2, 3)
    let now = 0
    const seen: number[] = []
    while (now < 20000) {
      now += 1000 / 30
      g.observe(1000 / 30)
      g.frame(1 / 30, now)
      seen.push(g.q)
    }
    expect(Math.min(...seen.slice(-300))).toBe(3)
  })

  it('learns a 30 Hz clock mid-story without stepping down: the signature keeps its effects throughout', () => {
    const g = new Governor(2, 3)
    let now = 0
    const seen: number[] = []
    // Four seconds of a story held at 30 Hz (an iPhone in Low Power Mode), every frame a thirtieth apart.
    while (now < 4000) {
      now += 1000 / 30
      g.observe(1000 / 30)
      g.frame(1 / 30, now, true)
      seen.push(g.q)
    }
    expect(Math.min(...seen)).toBe(2)
    expect(g.refresh).toBeCloseTo(1000 / 30, 0)
  })

  it('still steps down mid-story a GPU that holds frames at 33ms on a display seen running at 60 Hz', () => {
    const g = new Governor(2, 3)
    for (let i = 0; i < 30; i++) g.observe(1000 / 60)
    let now = 0
    const seen: number[] = []
    while (now < 4000) {
      now += 1000 / 30
      g.observe(1000 / 30)
      g.frame(1 / 30, now, true)
      seen.push(g.q)
    }
    expect(Math.min(...seen)).toBeLessThan(2)
  })

  it('follows the clock back when it speeds up again (Low Power Mode turned off)', () => {
    const g = new Governor(3, 3)
    const a = run(g, 10, () => 1000 / 30)
    run(g, 10, () => 1000 / 60, a.now)
    expect(g.refresh).toBeCloseTo(1000 / 60, 0)
    expect(g.q).toBe(3)
  })

  it('learns a 30 Hz clock while held, but goes back up only once the hold is let go', () => {
    const g = new Governor(2, 3)
    let now = 0
    const seen: number[] = []
    for (let i = 0; i < 90; i++) {
      now += 1000 / 30
      g.frame(1 / 30, now, true)
      seen.push(g.q)
    }
    // Mid-story: it may step down once, and holds there rather than sharpening while the story plays.
    expect(seen.at(-1)).toBeLessThanOrEqual(2)
    const low = seen.at(-1)!
    expect(seen.slice(seen.indexOf(low))).toEqual(seen.slice(seen.indexOf(low)).map(() => low))
    for (let i = 0; i < 30; i++) {
      now += 1000 / 30
      g.frame(1 / 30, now, false)
    }
    expect(g.q).toBeGreaterThanOrEqual(2)
    expect(g.refresh).toBeCloseTo(1000 / 30, 0)
  })

  it('does not take a step that helped a little for a slow clock: 27ms is no display rate, so it is work', () => {
    const g = new Governor(3, 3)
    // A 60 Hz display on a GPU that needs 20, 24, 27 and 30ms a frame at 0 to 3. The probe's step (30 → 27ms) is no
    // display's rate, so it is not taken for a clock: the refresh stays where the fast frames put it (it only creeps,
    // 0.05% a frame, as a change of display would need), and the quality stays down.
    const { seen } = run(g, 6, (q) => [20, 24, 27, 30][q]!)
    expect(g.refresh).toBeLessThan(20)
    expect(Math.max(...seen.slice(-60))).toBeLessThan(3)
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
  // Resolution is the last resort (components/stage/useStage.ts): a level below the lightest effects exists only for a
  // low-tier device, and it is reached only when frames still miss there; a laptop or a phone never gets one.
  it('takes a low-tier device below its lightest effects only when its frames still miss there, and never a laptop or phone', () => {
    // Every level misses its frames: 25ms on a 60 Hz display, ±3ms frame to frame, so no clock explains them.
    let k = 0
    const heavy = (q: number) => (q >= 0 ? 25 + (k++ % 2 ? 3 : -3) : 1000 / 60)
    const low = new Governor(1, 1, -1)
    run(low, 1, () => 1000 / 60)
    expect(Math.min(...run(low, 20, heavy, 1000).seen)).toBe(-1)
    const phone = new Governor(2, 3)
    run(phone, 1, () => 1000 / 60)
    expect(Math.min(...run(phone, 20, heavy, 1000).seen)).toBe(0)
  })

  it('keeps a low-tier device that holds its frames at its lightest effects at full resolution', () => {
    // Slow at level 1, fine at 0: it settles at 0 and never takes the last resort.
    const g = new Governor(1, 1, -1)
    run(g, 1, () => 1000 / 60)
    let k = 0
    const { seen } = run(g, 20, (q) => (q >= 1 ? 25 + (k++ % 2 ? 3 : -3) : 1000 / 60), 1000)
    expect(Math.min(...seen)).toBe(0)
  })
})
