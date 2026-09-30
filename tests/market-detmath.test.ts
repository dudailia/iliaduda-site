import { describe, expect, it } from 'vitest'
import { dexp, dlog, dpow } from '@/lib/market/detmath'

/**
 * The market's own exponential and logarithm. Math.exp and Math.log are not
 * required to round the same way in every JavaScript engine, and one bit of
 * difference in a Hawkes decay grows into a different market within seconds:
 * Safari's live figure would drift from the poster the server built. These are
 * built from IEEE-exact arithmetic only, so every engine computes the same
 * bits; the tests check they are as accurate as the platform's.
 */

const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), Number.MIN_VALUE)

describe('the deterministic exponential', () => {
  it('matches Math.exp to within two units in the last place across the range the market uses', () => {
    let worst = 0
    for (let x = -60; x <= 60; x += 0.00731) worst = Math.max(worst, rel(dexp(x), Math.exp(x)))
    for (let x = -1e-3; x <= 1e-3; x += 1.3e-6) worst = Math.max(worst, rel(dexp(x), Math.exp(x)))
    expect(worst).toBeLessThan(4.5e-16)
  })
  it('handles its edges', () => {
    expect(dexp(0)).toBe(1)
    expect(dexp(-800)).toBe(0)
    expect(dexp(800)).toBe(Infinity)
    expect(Number.isNaN(dexp(NaN))).toBe(true)
  })
})

describe('the deterministic logarithm', () => {
  it('matches Math.log to within two units in the last place, from tiny to huge', () => {
    let worst = 0
    for (let x = 1e-12; x < 1e12; x *= 1.0137) worst = Math.max(worst, Math.abs(dlog(x) - Math.log(x)) / Math.max(1, Math.abs(Math.log(x))))
    for (let x = 0.5; x <= 2; x += 1e-5) worst = Math.max(worst, rel(dlog(x), Math.log(x)) * (Math.abs(Math.log(x)) < 1e-3 ? 0 : 1))
    for (let u = 1e-9; u < 1; u += 0.000731) worst = Math.max(worst, Math.abs(dlog(1 - u) - Math.log(1 - u)) / Math.max(1e-300, Math.abs(Math.log(1 - u))))
    expect(worst).toBeLessThan(4.5e-16)
  })
  it('handles its edges', () => {
    expect(dlog(1)).toBe(0)
    expect(dlog(0)).toBe(-Infinity)
    expect(Number.isNaN(dlog(-1))).toBe(true)
    expect(dlog(Infinity)).toBe(Infinity)
  })
})

describe('the deterministic power', () => {
  it('matches Math.pow for the book’s power law', () => {
    let worst = 0
    for (let d = 1; d <= 400; d++) for (const g of [0.5, 0.9, 1.3, 2]) worst = Math.max(worst, rel(dpow(d, -g), d ** -g))
    expect(worst).toBeLessThan(2e-15)
  })
})

describe('the market', () => {
  it('computes no exponential, logarithm or power with the platform’s own, which engines may round differently', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const found: string[] = []
    for (const f of readdirSync('lib/market')) {
      if (!f.endsWith('.ts') || f === 'detmath.ts') continue
      const code = readFileSync(`lib/market/${f}`, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      for (const m of code.matchAll(/Math\.(exp|log|log1p|expm1|pow|log2|log10|sinh|cosh|tanh)\b|\*\*/g)) found.push(`${f}: ${m[0]}`)
    }
    expect(found).toEqual([])
  })
})
