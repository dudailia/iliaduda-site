import { describe, expect, it } from 'vitest'
import { Flow } from '@/lib/market/flow'
import { MARKET } from '@/lib/market/params'
import { Realised, TRADING_SECONDS } from '@/lib/market/realised'
import { mulberry32 } from '@/lib/market/rng'

/**
 * The one market, calibrated. Every view on the site draws it — the order
 * book, the futures fan, the volatility surface — so its calm regime is pinned
 * here, over ten seeds: a busy stock (a few hundred events a second of
 * simulated time), a realised volatility in the range the hero prices at, a
 * spread of a tick or two, and a stationary process.
 */

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/** A run of `secs` simulated seconds after burn-in, sampled once a second. */
function sample(seed: number, secs: number) {
  const f = new Flow(seed)
  const t0 = f.t
  const n0 = f.hawkes.counts.reduce((a, b) => a + b, 0)
  const mids: number[] = [f.book.mid]
  let narrow = 0
  for (let s = 1; s <= secs; s++) {
    f.advance(t0 + s)
    mids.push(f.book.mid)
    if (f.book.spread <= 2) narrow++
  }
  return { f, rate: (f.hawkes.counts.reduce((a, b) => a + b, 0) - n0) / secs, mids, narrow: narrow / secs }
}

describe('the calibrated market, in its calm regime', () => {
  it('is stationary', () => {
    expect(new Flow().rho).toBeLessThan(1)
  })

  it('is busy: 200–400 events a second of simulated time, on every seed', () => {
    for (const seed of SEEDS) {
      const { rate } = sample(seed, 120)
      expect(rate, `seed ${seed}`).toBeGreaterThan(200)
      expect(rate, `seed ${seed}`).toBeLessThan(400)
    }
  })

  it('moves like a stock: realised volatility 20–30% a year, and its spread is a tick or two', { timeout: 60_000 }, () => {
    for (const seed of SEEDS) {
      const { mids, narrow } = sample(seed, 900)
      let ss = 0
      for (let i = 1; i < mids.length; i++) ss += Math.log(mids[i]! / mids[i - 1]!) ** 2
      const vol = Math.sqrt((ss / (mids.length - 1)) * TRADING_SECONDS)
      expect(vol, `seed ${seed}`).toBeGreaterThan(0.2)
      expect(vol, `seed ${seed}`).toBeLessThan(0.3)
      expect(narrow, `seed ${seed}`).toBeGreaterThan(0.8)
    }
  })

  it('holds the book’s invariants over a million events', { timeout: 60_000 }, () => {
    const f = new Flow(11)
    const t0 = f.t
    let s = 0
    while (f.hawkes.counts.reduce((a, b) => a + b, 0) < 1_000_000) {
      f.advance(t0 + ++s)
      const b = f.book
      expect(b.bestBid).toBeLessThan(b.bestAsk)
      expect(b.totalBid).toBeGreaterThan(0)
      expect(b.totalAsk).toBeGreaterThan(0)
    }
  })

  it('keeps its parameters in one place', () => {
    expect(MARKET.hawkes.mu.length).toBe(6)
  })
})

describe('realised volatility', () => {
  it('is an unbiased estimate: on a random walk of known volatility it settles within its error of the truth', () => {
    for (const sigma of [0.15, 0.25, 0.4]) {
      const rng = mulberry32(99)
      const normal = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng())
      const r = new Realised(60)
      let mid = 100
      const est: number[] = []
      const sd1 = sigma / Math.sqrt(TRADING_SECONDS)
      for (let s = 0; s < 40_000; s++) {
        mid *= Math.exp(sd1 * normal())
        r.push(mid)
        if (s > 600 && s % 200 === 0) est.push(r.sigma ** 2)
      }
      const meanVar = est.reduce((a, b) => a + b, 0) / est.length
      // The EWMA of r² estimates σ²; over 200 near-independent windows its mean is within a few percent.
      expect(Math.abs(meanVar / sigma ** 2 - 1)).toBeLessThan(0.05)
    }
  })

  it('is annualised by 252 trading days of 6.5 hours', () => {
    expect(TRADING_SECONDS).toBe(252 * 6.5 * 3600)
  })
})
