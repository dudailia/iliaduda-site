import { afterEach, describe, expect, it, vi } from 'vitest'
import { onPageClock, resetPageClock } from '@/lib/stage/clock'
import { Governor } from '@/lib/stage/governor'

/** Animation frames at `ms`, each stamped late by up to `late` ms (Low Power Mode's Safari: 30 Hz, 0–22ms late). */
function frames(ms: number, late: number, seed = 7) {
  let t = 0, r = seed
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647)
  const queue: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => (queue.push(f), queue.length))
  return (n: number) => {
    for (let i = 0; i < n && queue.length; i++) {
      t += ms
      queue.shift()!(t + rand() * late)
    }
  }
}

afterEach(() => {
  resetPageClock()
  vi.unstubAllGlobals()
})

describe('the page clock', () => {
  it('reads a jittered 30 Hz clock, and seeds a governor that started at 60 with it', () => {
    const run = frames(1000 / 30, 22)
    const gov = new Governor(2, 2)
    onPageClock((v) => gov.seed(v))
    run(80)
    expect(gov.refresh).toBeGreaterThan(30)
    expect(gov.refresh).toBeLessThan(36.5)
    // Story frames at the clock's pace then read as the clock, not as slow work: no step down.
    let now = 0
    let changed = false
    for (let i = 0; i < 120; i++) changed = gov.frame(1 / 30, (now += 1000 / 30), true) || changed
    expect(changed).toBe(false)
    expect(gov.q).toBe(2)
  })

  it('leaves a 60 Hz governor alone', () => {
    const run = frames(1000 / 60, 2)
    const gov = new Governor(2, 2)
    onPageClock((v) => gov.seed(v))
    run(80)
    expect(gov.refresh).toBeCloseTo(1000 / 60, 0)
  })

  it('a governor that starts after the clock was read is seeded at once', () => {
    const run = frames(1000 / 30, 22)
    onPageClock(() => {})
    run(80)
    const gov = new Governor(2, 2)
    onPageClock((v) => gov.seed(v))
    expect(gov.refresh).toBeGreaterThan(30)
  })
})

/** The kit at rest (no hold): a frame drawn at `work` ms on a clock of `clock` ms; asked for light frames, it leaves every other frame undrawn and tells the governor the interval after it. */
function atRest(gov: Governor, clock: number, work: number | ((q: number) => number), ms: number, from = 0) {
  let now = from, changes = 0, lit = false
  while (now < from + ms) {
    if (gov.probing && !lit) {
      lit = true
      now += clock
      gov.observe(clock, now)
      continue
    }
    lit = false
    const w = typeof work === 'number' ? work : work(gov.q)
    const dt = Math.max(clock, Math.ceil(w / clock) * clock)
    now += dt
    if (gov.frame(dt / 1000, now)) changes++
  }
  return { now, changes }
}

describe('Low Power Mode turned on at rest', () => {
  it('a 60 Hz figure whose display drops to 30 learns the clock from fresh light frames: no step down and back', () => {
    const gov = new Governor(2, 2)
    const a = atRest(gov, 1000 / 60, 8, 3000)
    const b = atRest(gov, 1000 / 30, 8, 8000, a.now)
    expect(a.changes + b.changes).toBe(0)
    expect(gov.q).toBe(2)
    expect(gov.refresh).toBeGreaterThan(30)
  })

  it('a GPU holding 60 Hz at half rate still steps down: its light frames say the display runs at 60', () => {
    const gov = new Governor(2, 2)
    // 25ms of work at its heaviest level, 10 below it.
    atRest(gov, 1000 / 60, (q) => (q >= 2 ? 25 : 10), 6000)
    expect(gov.q).toBe(1)
  })
})

describe('Low Power Mode turned on mid-visit, with late stamps', () => {
  /** The kit at rest on a 30 Hz clock whose stamps run 0–22ms late; asked for light frames, every other one undrawn. */
  function jittered(gov: Governor, from: number, ms: number, seed: number) {
    let r = seed, now = from, late = 0, lit = false, changes = 0
    const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647)
    while (now < from + ms) {
      const next = rand() * 22
      const iv = 1000 / 30 + next - late
      late = next
      now += iv
      if (gov.probing && !lit) {
        lit = true
        gov.observe(iv, now)
        continue
      }
      lit = false
      if (gov.frame(iv / 1000, now)) changes++
    }
    return changes
  }

  it('changes the quality in at most one visit in forty', () => {
    let changed = 0
    for (let seed = 1; seed <= 40; seed++) {
      const gov = new Governor(2, 2)
      const a = atRest(gov, 1000 / 60, 8, 3000)
      if (a.changes + jittered(gov, a.now, 8000, seed) > 0) changed++
    }
    expect(changed).toBeLessThanOrEqual(1)
  })
})
