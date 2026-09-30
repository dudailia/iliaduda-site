import { describe, expect, it } from 'vitest'
import { arrived, spring } from '@/lib/stage/spring'

/**
 * The figures' one spring: critically damped, stepped exactly (the closed-form
 * solution, not an integrator), so it is the same motion at 30, 60 or 144
 * frames a second, never overshoots from rest, and carries a hand's speed.
 */

describe('the critically damped spring', () => {
  it('is the same motion whatever the frame rate', () => {
    const a = { x: 1, v: 0 }, b = { x: 1, v: 0 }, c = { x: 1, v: 0 }
    for (let i = 0; i < 60; i++) spring(a, 0, 1 / 60, 4)
    for (let i = 0; i < 144; i++) spring(b, 0, 1 / 144, 4)
    spring(c, 0, 1, 4)
    expect(a.x).toBeCloseTo(c.x, 12)
    expect(b.x).toBeCloseTo(c.x, 12)
    expect(a.v).toBeCloseTo(c.v, 12)
  })

  it('never overshoots from rest, and settles', () => {
    const s = { x: 1, v: 0 }
    let prev = 1
    for (let i = 0; i < 300; i++) {
      spring(s, 0, 1 / 60, 4)
      expect(s.x).toBeGreaterThanOrEqual(0)
      expect(s.x).toBeLessThanOrEqual(prev)
      prev = s.x
    }
    expect(arrived(s, 0, 1e-3)).toBe(true)
    expect(s).toEqual({ x: 0, v: 0 })
  })

  it('carries the speed it was let go with, then comes home without passing it', () => {
    const s = { x: 0, v: 1 }
    let far = 0
    for (let i = 0; i < 300; i++) {
      spring(s, 0, 1 / 60, 7)
      far = Math.max(far, s.x)
      expect(s.x).toBeGreaterThanOrEqual(-1e-12)
    }
    expect(far).toBeGreaterThan(0.04)
  })
})
