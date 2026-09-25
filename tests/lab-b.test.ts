import { describe, expect, it } from 'vitest'
import { Book, CANCEL_ASK, CANCEL_BID, LIMIT_BUY, LIMIT_SELL, MARKET_BUY, MARKET_SELL, type Trade } from '@/lib/lab/b/book'
import { Hawkes, branchingMatrix, solve, spectralRadius, stationaryRates, type HawkesParams } from '@/lib/lab/b/hawkes'
import { mulberry32 } from '@/lib/lab/b/rng'
import { BOOK, HALF, HAWKES, LEVELS, POSTER_T, ROWS, Sim, posterSim } from '@/lib/lab/b/sim'

/**
 * Lab B: the order book as terrain. Every number the hero shows comes out of
 * this simulation, so the simulation is what is tested: the Hawkes process
 * converges to the rate theory says it must, and the book never enters a
 * state a real book cannot be in.
 */

describe('Hawkes process', () => {
  it('is stationary: the spectral radius of the branching matrix is below one', () => {
    const rho = spectralRadius(branchingMatrix(HAWKES))
    expect(rho).toBeGreaterThan(0.2)
    expect(rho).toBeLessThan(1)
  })

  it('finds the Perron root of a matrix whose answer is known', () => {
    // [[0, 2], [0.5, 0]] has eigenvalues ±1; the Perron root is 1.
    expect(spectralRadius([[0, 2], [0.5, 0]])).toBeCloseTo(1, 9)
    expect(spectralRadius([[0.3, 0.1], [0.2, 0.4]])).toBeCloseTo(0.5, 9)
  })

  it('solves (I − B) Λ = μ', () => {
    const x = solve([[2, 1], [1, 3]], [3, 5])
    expect(x[0]).toBeCloseTo(0.8, 12)
    expect(x[1]).toBeCloseTo(1.4, 12)
  })

  it('refuses an explosive process', () => {
    const p: HawkesParams = { mu: [1], jump: [[3]], decay: [2] }
    expect(() => new Hawkes(p, mulberry32(1))).toThrow(/not stationary/)
  })

  it('matches the stationary rate (I − B)⁻¹ μ over a long run, in total and per type', () => {
    const h = new Hawkes(HAWKES, mulberry32(7))
    const T = 20000
    let n = 0
    h.run(T, () => n++)
    const want = stationaryRates(HAWKES)
    const total = want.reduce((a, b) => a + b, 0)
    // σ of the count is about √(ΛT)/(1 − ρ): ~0.5% here, so 2% is four σ.
    expect(Math.abs(n / T - total) / total).toBeLessThan(0.02)
    want.forEach((w, i) => expect(Math.abs(h.counts[i]! / T - w) / w).toBeLessThan(0.05))
  })

  it('matches a one-dimensional closed form: λ = μ / (1 − a/β)', () => {
    const h = new Hawkes({ mu: [2], jump: [[1.5]], decay: [3] }, mulberry32(3))
    let n = 0
    h.run(40000, () => n++)
    expect(n / 40000).toBeGreaterThan(4 * 0.97)
    expect(n / 40000).toBeLessThan(4 * 1.03)
  })

  it('is deterministic for a seed', () => {
    const a: number[] = [], b: number[] = []
    new Hawkes(HAWKES, mulberry32(11)).run(50, (t, k) => a.push(t, k))
    new Hawkes(HAWKES, mulberry32(11)).run(50, (t, k) => b.push(t, k))
    expect(a.length).toBeGreaterThan(300)
    expect(a).toEqual(b)
  })

  it('stops exactly at the horizon and resumes without loss', () => {
    const one: number[] = [], two: number[] = []
    const h1 = new Hawkes(HAWKES, mulberry32(5))
    h1.run(30, (t) => one.push(t))
    const h2 = new Hawkes(HAWKES, mulberry32(5))
    for (let t = 0.5; t <= 30; t += 0.5) h2.run(t, (x) => two.push(x))
    expect(h2.t).toBe(30)
    // Different candidate draws, same law: event counts agree to within noise.
    expect(Math.abs(one.length - two.length)).toBeLessThan(0.25 * one.length)
    expect(two.every((t, i) => i === 0 || t > two[i - 1]!)).toBe(true)
  })
})

describe('limit order book', () => {
  type Before = { bid: Int32Array; ask: Int32Array; bb: number; ba: number; bbQ: number; baQ: number; base: number }
  const EMPTY = new Int32Array(0)
  const run = (seed: number, events: number, check: (b: Book, type: number, before: Before, fills: Trade[]) => void, arrays = false) => {
    const rng = mulberry32(seed)
    const h = new Hawkes(HAWKES, rng)
    const b = new Book(BOOK, rng, 10000, () => 8)
    let n = 0
    let t = 0
    while (n < events) {
      t += 10
      h.run(t, (time, type) => {
        const full = arrays || type === MARKET_BUY || type === MARKET_SELL
        const before: Before = {
          bid: full ? b.bid.slice() : EMPTY,
          ask: full ? b.ask.slice() : EMPTY,
          bb: b.bestBid,
          ba: b.bestAsk,
          bbQ: b.bidAt(b.bestBid),
          baQ: b.askAt(b.bestAsk),
          base: b.base,
        }
        const fills: Trade[] = []
        b.apply(type, time, (tr) => fills.push(tr))
        if (b.base === before.base) check(b, type, before, fills)
        n++
      })
    }
    return b
  }

  it('holds its invariants over 200,000 events', () => {
    let trades = 0
    const bad: string[] = []
    const fail = (why: string) => bad.length < 5 && bad.push(why)
    run(1, 200_000, (b, type, before, fills) => {
      if (!(b.bestBid < b.bestAsk)) fail('crossed')
      if (b.totalBid <= 0 || b.totalAsk <= 0) fail('empty side')
      if (b.bidAt(b.bestBid) <= 0 || b.askAt(b.bestAsk) <= 0) fail('empty touch')
      trades += fills.length
      // The touch moves only when a level empties or a limit order improves it.
      if (b.bestAsk !== before.ba) {
        const emptied = before.baQ > 0 && b.askAt(before.ba) === 0
        const improved = type === LIMIT_SELL && b.bestAsk < before.ba
        if (!emptied && !improved) fail(`ask moved on ${type}`)
      }
      if (b.bestBid !== before.bb) {
        const emptied = before.bbQ > 0 && b.bidAt(before.bb) === 0
        const improved = type === LIMIT_BUY && b.bestBid > before.bb
        if (!emptied && !improved) fail(`bid moved on ${type}`)
      }
    })
    expect(bad).toEqual([])
    expect(trades).toBeGreaterThan(10_000)
  })

  it('never holds a negative queue, and its totals are the sums of its queues', () => {
    const b = run(2, 50_000, () => {})
    let bid = 0, ask = 0
    for (let i = 0; i < b.bid.length; i++) {
      expect(b.bid[i]).toBeGreaterThanOrEqual(0)
      expect(b.ask[i]).toBeGreaterThanOrEqual(0)
      bid += b.bid[i]!
      ask += b.ask[i]!
    }
    expect(bid).toBe(b.totalBid)
    expect(ask).toBe(b.totalAsk)
    // No bid rests at or above the best ask, and no ask at or below the best bid.
    for (let i = 0; i < b.bid.length; i++) {
      if (b.bid[i]! > 0) expect(i + b.base).toBeLessThanOrEqual(b.bestBid)
      if (b.ask[i]! > 0) expect(i + b.base).toBeGreaterThanOrEqual(b.bestAsk)
    }
  })

  it('fills market orders at the touch, walking outward level by level', () => {
    let checked = 0
    run(3, 60_000, (b, type, before, fills) => {
      if (type !== MARKET_BUY && type !== MARKET_SELL) {
        expect(fills).toEqual([])
        return
      }
      const buy = type === MARKET_BUY
      const q = buy ? before.ask : before.bid
      let price = buy ? before.ba : before.bb
      for (const f of fills) {
        // Skip empty ticks: the next fill is at the next non-empty level.
        while (q[price - b.base] === 0) price += buy ? 1 : -1
        expect(f.price).toBe(price)
        expect(f.side).toBe(buy ? 1 : -1)
        expect(f.size).toBeGreaterThan(0)
        expect(f.size).toBeLessThanOrEqual(q[price - b.base]!)
        // Only the last fill may leave shares at its level.
        if (f !== fills[fills.length - 1]) expect(f.size).toBe(q[price - b.base])
        price += buy ? 1 : -1
        checked++
      }
    })
    expect(checked).toBeGreaterThan(5000)
  })

  it('cancels remove shares from the side they name', () => {
    run(4, 5_000, (b, type, before) => {
      const dBid = b.totalBid - before.bid.reduce((a, x) => a + x, 0)
      const dAsk = b.totalAsk - before.ask.reduce((a, x) => a + x, 0)
      if (type === CANCEL_BID) {
        expect(dBid).toBeLessThanOrEqual(0)
        expect(dAsk).toBe(0)
      }
      if (type === CANCEL_ASK) {
        expect(dAsk).toBeLessThanOrEqual(0)
        expect(dBid).toBe(0)
      }
    }, true)
  })
})

describe('the sampled market the hero draws', () => {
  it('is the same market for the same seed: the poster and the live run agree', () => {
    const a = posterSim()
    const b = new Sim()
    b.advance(POSTER_T)
    expect(a.head).toBe(b.head)
    expect(Array.from(a.depth)).toEqual(Array.from(b.depth))
    expect(a.stats()).toEqual(b.stats())
  })

  it('fills the ring and stores rows consistent with the book at the moment', () => {
    const s = posterSim()
    expect(s.written).toBeGreaterThanOrEqual(ROWS)
    for (let age = 0; age < ROWS; age++) {
      const r = s.row(age)
      const bb = s.bids[r]!, ba = s.asks[r]!, c = s.centre[r]!
      expect(bb).toBeLessThan(ba)
      expect(s.mids[r]).toBe((bb + ba) / 2)
      // Bids to the left carry negative cumulative depth that grows outward;
      // asks to the right positive; nothing inside the spread.
      let prev = 0
      for (let p = ba; p < c - HALF + LEVELS; p++) {
        const d = s.depthAt(r, p)
        expect(d).toBeGreaterThanOrEqual(prev)
        prev = d
      }
      prev = 0
      for (let p = bb; p >= c - HALF; p--) {
        const d = s.depthAt(r, p)
        expect(d).toBeLessThanOrEqual(prev)
        prev = d
      }
      for (let p = bb + 1; p < ba; p++) expect(s.depthAt(r, p)).toBe(0)
      expect(s.depthAt(r, ba)).toBe(s.queueAt(r, ba))
      expect(s.depthAt(r, bb)).toBe(-s.queueAt(r, bb))
    }
  })

  it('reports a rolling event rate near the stationary one', () => {
    const s = new Sim()
    let sum = 0
    for (let k = 1; k <= 60; k++) {
      s.advance(POSTER_T + k * 10)
      sum += s.stats().rate
    }
    expect(Math.abs(sum / 60 - s.expected) / s.expected).toBeLessThan(0.08)
  })

  it('advances in small slices at no more than ~15 events per slice', () => {
    const s = posterSim()
    let worst = 0
    const t0 = s.t
    for (let i = 1; i <= 600; i++) {
      const before = s.hawkes.counts.reduce((a, b) => a + b, 0)
      s.advance(t0 + i / 60)
      worst = Math.max(worst, s.hawkes.counts.reduce((a, b) => a + b, 0) - before)
    }
    expect(worst).toBeLessThan(15)
  })
})
