import { describe, expect, it } from 'vitest'
import { Market } from '../lib/market/engine'
import { STRESS, Stress, stressOf } from '../lib/market/stress'

/**
 * The market's stress, s ∈ [0, 1]: what drives the vol surface's shock on
 * /market. A stated function of four things a trader would read as stress —
 * selling pressure, volatility well above calm, a wide spread, and the shares
 * near the touch drained — each nothing across the calm market's own range,
 * combined as an "or", then smoothed.
 */

const calm = { pressure: 1, sigma: STRESS.sigma0, spread: 1, touch: 101 }

describe('the stress index', () => {
  it('rises with each of its four inputs, the others held: selling pressure, volatility, spread, a drained touch', () => {
    let prev = -1
    for (let x = 0; x <= 5; x += 0.05) {
      const s = stressOf(x, calm.sigma, calm.spread, calm.touch)
      expect(s).toBeGreaterThanOrEqual(prev)
      prev = s
    }
    prev = -1
    for (let v = 0.1; v <= 1; v += 0.01) {
      const s = stressOf(calm.pressure, v, calm.spread, calm.touch)
      expect(s).toBeGreaterThanOrEqual(prev)
      prev = s
    }
    prev = -1
    for (let sp = 1; sp <= 12; sp++) {
      const s = stressOf(calm.pressure, calm.sigma, sp, calm.touch)
      expect(s).toBeGreaterThanOrEqual(prev)
      prev = s
    }
    prev = -1
    for (let d = 300; d >= 0; d -= 2) {
      const s = stressOf(calm.pressure, calm.sigma, calm.spread, d)
      expect(s).toBeGreaterThanOrEqual(prev)
      prev = s
    }
  })

  it('is nothing across the calm market’s own range, and everything at the far end of each', () => {
    expect(stressOf(1.47, 0.294, 2, 48)).toBe(0)
    expect(stressOf(2.2, 0.25, 1, 101)).toBe(1)
    expect(stressOf(1, STRESS.sigma0 * 4, 1, 101)).toBe(1)
    expect(stressOf(1, 0.25, 7, 101)).toBe(1)
    expect(stressOf(1, 0.25, 1, 0)).toBe(1)
  })

  it('stays inside [0, 1] whatever it is given', () => {
    for (const x of [-1, 0, 3, NaN])
      for (const v of [-1, 0, 0.2, 5, Infinity, NaN])
        for (const sp of [-3, 0, 1, 50, NaN])
          for (const d of [-10, 0, 100, 1e6, NaN]) {
            const s = stressOf(x, v, sp, d)
            expect(s).toBeGreaterThanOrEqual(0)
            expect(s).toBeLessThanOrEqual(1)
          }
  })

  it('follows its input on a 0.35 s half-life', () => {
    const st = new Stress()
    for (let i = 0; i < 21; i++) st.update(1, 1 / 60)
    expect(st.s).toBeCloseTo(0.5, 6)
  })

  it('is near nothing in a calm market: over ten seeds and ten simulated minutes each', () => {
    const all: number[] = []
    for (let seed = 1; seed <= 10; seed++) {
      const m = new Market(seed)
      const t0 = m.t
      for (let s = 1; s <= 600; s++) {
        m.advance(t0 + s)
        all.push(m.stress)
      }
    }
    all.sort((a, b) => a - b)
    const mean = all.reduce((a, b) => a + b, 0) / all.length
    expect(mean).toBeLessThan(0.05)
    expect(all[Math.floor(0.95 * (all.length - 1))]!).toBeLessThan(0.2)
  }, 600_000)
})
