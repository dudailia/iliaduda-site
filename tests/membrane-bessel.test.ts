import { describe, expect, it } from 'vitest'
import ref from './fixtures/bessel-ref.json'
import { besselJ, besselZeros } from '@/lib/membrane/bessel'

/**
 * The drum's Bessel functions and their zeros, against SciPy's (scipy.special.jv and jn_zeros, recorded in
 * tests/fixtures/bessel-ref.json): every value the figure draws comes from these two functions.
 */
describe('Bessel functions of the first kind', () => {
  it('match SciPy to 1e-12 for orders 0–20 and arguments 0–80', () => {
    for (const [n, x, want] of ref.J as [number, number, number][]) {
      expect(Math.abs(besselJ(n, x) - want), `J${n}(${x})`).toBeLessThan(1e-12)
    }
  })
  it('satisfy the recurrence J(n−1) + J(n+1) = (2n/x) J(n)', () => {
    for (const x of [0.7, 3.3, 11.2, 47.9])
      for (let n = 1; n < 12; n++) expect(Math.abs(besselJ(n - 1, x) + besselJ(n + 1, x) - ((2 * n) / x) * besselJ(n, x))).toBeLessThan(1e-12)
  })
})

describe('their zeros', () => {
  it('match SciPy to 1e-12, the first twenty of orders 0–5', () => {
    for (const [n, zs] of Object.entries(ref.zeros) as [string, number[]][]) {
      const got = besselZeros(Number(n), zs.length)
      zs.forEach((z, i) => expect(Math.abs(got[i]! - z), `j${n},${i + 1}`).toBeLessThan(1e-12))
    }
  })
  it('are where the function vanishes, in increasing order', () => {
    for (let n = 0; n < 4; n++) {
      const zs = besselZeros(n, 20)
      zs.forEach((z, i) => {
        expect(Math.abs(besselJ(n, z))).toBeLessThan(1e-13)
        if (i) expect(z).toBeGreaterThan(zs[i - 1]!)
      })
    }
  })
  it('include the exercises’ values: 2.4048, 5.5201, 3.8317, 7.0156, 5.1356 and 8.4172', () => {
    expect(besselZeros(0, 2).map((z) => z.toFixed(4))).toEqual(['2.4048', '5.5201'])
    expect(besselZeros(1, 2).map((z) => z.toFixed(4))).toEqual(['3.8317', '7.0156'])
    expect(besselZeros(2, 2).map((z) => z.toFixed(4))).toEqual(['5.1356', '8.4172'])
  })
})
