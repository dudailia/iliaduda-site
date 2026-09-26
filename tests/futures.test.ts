import { describe, expect, it } from 'vitest'
import { RNG } from '@/lib/futures/glsl'
import { Estimator, MODEL, SALT, bs, bsCall, discount, normals4, path, pcg4d, price, terminal, unit } from '@/lib/futures/mc'
import { posterData } from '@/lib/futures/poster'

/**
 * The home figure prices a call by Monte Carlo on the GPU. The GPU cannot be run here,
 * but its generator and step are mirrored exactly on the CPU (lib/futures/mc.ts),
 * so these tests prove the estimator the page runs: its random numbers are
 * standard normal and independent, its paths have the log-return moments the
 * model says, its price lands within four standard errors of Black–Scholes,
 * and its standard error falls like 1/√n.
 */

describe('the generator', () => {
  it('matches the GLSL constants', () => {
    expect(RNG).toContain('v * 1664525u + 1013904223u')
    expect(RNG).toContain(`const uint SEED = ${MODEL.seed}u;`)
    expect(RNG).toContain(`const uint SALT = ${SALT}u;`)
    expect(RNG).toContain('float(h >> 9u) + 0.5) * (1.0 / 8388608.0)')
  })

  it('is a pure function of its counter', () => {
    const a = Array.from(pcg4d(7, 3, MODEL.seed, SALT))
    pcg4d(8, 3, MODEL.seed, SALT)
    expect(Array.from(pcg4d(7, 3, MODEL.seed, SALT))).toEqual(a)
    expect(a.every((x) => Number.isInteger(x) && x >= 0 && x < 2 ** 32)).toBe(true)
  })

  it('gives uniforms strictly inside (0, 1)', () => {
    expect(unit(0)).toBeGreaterThan(0)
    expect(unit(0xffffffff)).toBeLessThan(1)
    // Exactly representable in float32, which is why the GPU agrees.
    expect(Math.fround(unit(0xffffffff))).toBe(unit(0xffffffff))
  })

  it('gives standard normals: mean 0, variance 1, no skew, the right tails', () => {
    const z = [0, 0, 0, 0]
    let n = 0, s = 0, s2 = 0, s3 = 0, tail = 0
    for (let id = 0; id < 50_000; id++) {
      normals4(id, id % 16, z)
      for (const v of z) {
        n++
        s += v
        s2 += v * v
        s3 += v * v * v
        if (Math.abs(v) > 1.96) tail++
      }
    }
    const m = s / n
    const v = s2 / n - m * m
    expect(Math.abs(m)).toBeLessThan(4 / Math.sqrt(n))
    expect(Math.abs(v - 1)).toBeLessThan(4 * Math.sqrt(2 / n))
    expect(Math.abs(s3 / n)).toBeLessThan(4 * Math.sqrt(15 / n))
    expect(Math.abs(tail / n - 0.05)).toBeLessThan(4 * Math.sqrt(0.05 * 0.95 / n))
  })

  it('has no correlation between neighbouring steps or neighbouring paths', () => {
    const a = [0, 0, 0, 0], b = [0, 0, 0, 0]
    const n = 40_000
    let steps = 0, paths = 0
    for (let id = 0; id < n; id++) {
      normals4(id, 0, a)
      normals4(id, 1, b)
      steps += a[3]! * b[0]!
      normals4(id + 1, 0, b)
      paths += a[0]! * b[0]!
    }
    expect(Math.abs(steps / n)).toBeLessThan(4 / Math.sqrt(n))
    expect(Math.abs(paths / n)).toBeLessThan(4 / Math.sqrt(n))
  })
})

describe('the paths', () => {
  it('start at today’s price and walk every step', () => {
    const p = path(0, 0.25)
    expect(p.length).toBe(MODEL.steps + 1)
    expect(p[0]).toBe(MODEL.s0)
    expect(p[MODEL.steps]).toBeCloseTo(terminal(0, 0.25), 9)
  })

  for (const sigma of [0.1, 0.25, 0.6]) {
    it(`have log-return mean (r − σ²/2)T and variance σ²T at σ = ${sigma}`, () => {
      const n = 40_000
      let s = 0, s2 = 0
      for (let id = 0; id < n; id++) {
        const x = Math.log(terminal(id, sigma) / MODEL.s0)
        s += x
        s2 += x * x
      }
      const m = s / n
      const v = s2 / n - m * m
      const want = sigma * sigma * MODEL.T
      expect(Math.abs(m - (MODEL.r - want / 2) * MODEL.T)).toBeLessThan(4 * Math.sqrt(want / n))
      expect(Math.abs(v - want)).toBeLessThan(4 * want * Math.sqrt(2 / n))
    })
  }
})

describe('Black–Scholes', () => {
  it('matches the textbook value', () => {
    // Hull, Options, Futures and Other Derivatives: S=100, K=100, T=1, r=5%, σ=20%.
    expect(bsCall(100, 100, 1, 0.05, 0.2)).toBeCloseTo(10.4506, 4)
  })
  it('respects put–call parity through its bounds', () => {
    const c = bs(0.25, 100)
    expect(c).toBeGreaterThan(MODEL.s0 - 100 * discount())
    expect(c).toBeLessThan(MODEL.s0)
  })
})

describe('the estimator', () => {
  for (const [sigma, K] of [
    [0.25, 100],
    [0.15, 120],
    [0.6, 80],
    [0.4, 150],
  ] as const) {
    it(`lands within 4 standard errors of Black–Scholes at σ = ${sigma}, K = ${K}`, () => {
      const e = price(sigma, K, 65_536)
      expect(Math.abs(e.mean - bs(sigma, K))).toBeLessThan(4 * e.se)
      // The martingale check: E[S_T] = s0·e^{rT}.
      expect(Math.abs(e.forward - MODEL.s0 * Math.exp(MODEL.r * MODEL.T))).toBeLessThan(4 * MODEL.s0 * Math.sqrt((Math.exp(sigma * sigma) - 1) / e.n))
    })
  }

  it('has a standard error that falls like 1/√n', () => {
    const a = price(0.25, 100, 16_384)
    const b = price(0.25, 100, 65_536, 16_384)
    const c = price(0.25, 100, 262_144, 81_920)
    expect(b.se / a.se).toBeGreaterThan(0.45)
    expect(b.se / a.se).toBeLessThan(0.55)
    expect(c.se / b.se).toBeGreaterThan(0.45)
    expect(c.se / b.se).toBeLessThan(0.55)
    expect(Math.abs(c.mean - bs(0.25, 100))).toBeLessThan(4 * c.se)
  })

  it('adds batches the way the GPU hands them back', () => {
    const whole = price(0.3, 105, 8192)
    const e = new Estimator(discount())
    for (let from = 0; from < 8192; from += 1024) {
      const part = price(0.3, 105, 1024, from)
      e.add(part.sum, part.sum2, part.sumS, part.n)
    }
    expect(e.n).toBe(8192)
    expect(e.mean).toBeCloseTo(whole.mean, 10)
    expect(e.se).toBeCloseTo(whole.se, 10)
  })
})

describe('the poster', () => {
  it('is a real frame of the same computation', () => {
    const d = posterData(0.25, 100)
    expect(d.stats.n).toBe(65_536)
    expect(Math.abs(d.stats.mean - bs(0.25, 100))).toBeLessThan(4 * d.stats.se)
    expect(d.strands.length).toBeGreaterThan(50)
    expect(d.bars.length).toBeGreaterThan(20)
  })
})
