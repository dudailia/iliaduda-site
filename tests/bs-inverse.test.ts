import { describe, expect, it } from 'vitest'
import { cdf, inv } from '../lib/bs'

/** The standard normal's quantile function, inverse to the site's own distribution function to double precision. */
describe('the normal quantile', () => {
  it('undoes the distribution function across the whole range, to a few units in the last place', () => {
    for (const p of [1e-12, 1e-8, 1e-4, 0.001, 0.025, 0.05, 0.25, 0.5, 0.75, 0.95, 0.975, 0.999, 1 - 1e-6])
      expect(Math.abs(cdf(inv(p)) - p) / Math.min(p, 1 - p)).toBeLessThan(1e-9)
  })
  it('is odd about one half, and has the familiar values', () => {
    expect(inv(0.5)).toBe(0)
    expect(inv(0.975)).toBeCloseTo(1.959963984540054, 12)
    for (const p of [0.01, 0.2, 0.4]) expect(inv(1 - p)).toBeCloseTo(-inv(p), 12)
  })
})
