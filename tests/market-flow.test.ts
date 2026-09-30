import { describe, expect, it } from 'vitest'
import { MARKET_BUY, MARKET_SELL } from '@/lib/market/book'
import { EVENTS, Flow, attribute } from '@/lib/market/flow'
import { Hawkes, stationaryRates } from '@/lib/market/hawkes'
import { MARKET } from '@/lib/market/params'
import { mulberry32 } from '@/lib/market/rng'

/**
 * The Hawkes process made observable, for the order-flow figure: every event
 * kept with what it did to the book, the intensities it ran on, and which
 * earlier event most likely set it off. The checks are the ones a skeptical
 * reader would run: the thinning is exact (time rescaling), the attribution is
 * a probability and agrees with the intensity, the long-run share of
 * immigrants is the theory's, and the queue at the touch adds up.
 */

describe('the simulation is exact', () => {
  it('passes the time-rescaling test: each type’s compensator between its events is Exp(1)', { timeout: 60_000 }, () => {
    const p = MARKET.hawkes
    const K = p.mu.length
    for (const seed of [1, 2, 3, 4, 5]) {
      const h = new Hawkes(p, mulberry32(seed))
      // The model's own intensity, rebuilt from the event times and the true parameters alone — not read from the
      // simulation — and integrated exactly between events: a simulation that drifted from the model would draw events
      // this compensator cannot account for.
      const S = new Float64Array(K * K)
      const acc = new Float64Array(K)
      const inc: number[][] = Array.from({ length: K }, () => [])
      let last = 0
      h.run(200, (t, type) => {
        const dt = t - last
        for (let j = 0; j < K; j++) {
          const f = Math.exp(-p.decay[j]! * dt)
          for (let i = 0; i < K; i++) {
            acc[i]! += (S[i * K + j]! / p.decay[j]!) * (1 - f)
            S[i * K + j]! *= f
          }
        }
        for (let i = 0; i < K; i++) acc[i]! += p.mu[i]! * dt
        inc[type]!.push(acc[type]!)
        acc[type] = 0
        for (let i = 0; i < K; i++) S[i * K + type]! += p.jump[i]![type]!
        last = t
      })
      // Kolmogorov–Smirnov against Exp(1), per type and pooled. Thirty per-type tests and five pooled ones are run in
      // all, so each is held to its share of a 1% family-wise error (Bonferroni): c = √(−ln(α/2)/2).
      const crit = (alpha: number, n: number) => Math.sqrt(-Math.log(alpha / 2) / 2) / Math.sqrt(n)
      const ks = (xs: number[]) => {
        xs.sort((a, b) => a - b)
        const n = xs.length
        let d = 0
        for (let k = 0; k < n; k++) {
          const F = 1 - Math.exp(-xs[k]!)
          d = Math.max(d, Math.abs(F - k / n), Math.abs(F - (k + 1) / n))
        }
        return d
      }
      const pooled: number[] = []
      for (let i = 0; i < K; i++) {
        const xs = inc[i]!.slice(1)
        pooled.push(...xs)
        expect(ks(xs), `seed ${seed}, type ${i}, n ${xs.length}`).toBeLessThan(crit(0.01 / 30, xs.length))
      }
      expect(ks(pooled), `seed ${seed}, pooled, n ${pooled.length}`).toBeLessThan(crit(0.01 / 5, pooled.length))
    }
  })
})

describe('the events the figure keeps', () => {
  const f = new Flow(3)
  f.advance(f.t + 30)

  it('are a ring of the most recent, in time order', () => {
    expect(f.eventCount).toBe(EVENTS)
    let prev = -Infinity
    for (let a = EVENTS - 1; a >= 0; a--) {
      const e = f.event(a)
      expect(f.ev.t[e]!).toBeGreaterThanOrEqual(prev)
      prev = f.ev.t[e]!
    }
  })

  it('attribute each event to its parents with probabilities that sum to one and agree with its intensity', () => {
    let worst = 0
    for (let a = 0; a < 400; a++) {
      const e = f.event(a)
      const { immigrant, parents, lambda } = attribute(f, a, MARKET.hawkes)
      const sum = immigrant + parents.reduce((s, q) => s + q.p, 0)
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9)
      worst = Math.max(worst, Math.abs(lambda / f.ev.lam[e]! - 1))
    }
    // The window reaches back far enough that what it leaves out is negligible.
    expect(worst).toBeLessThan(1e-4)
  })

  it('are immigrants in the share the theory gives: Σμ over the stationary total', { timeout: 60_000 }, () => {
    const g = new Flow(4)
    let imm = 0, n = 0
    for (let s = 0; s < 12; s++) {
      g.advance(g.t + 5)
      for (let a = 0; a < 1500; a++) {
        imm += attribute(g, a, MARKET.hawkes).immigrant
        n++
      }
    }
    const theory = MARKET.hawkes.mu.reduce((x, y) => x + y, 0) / stationaryRates(MARKET.hawkes).reduce((x, y) => x + y, 0)
    expect(Math.abs(imm / n / theory - 1)).toBeLessThan(0.04)
  })

  it('add up at the touch: a market order takes its shares from the queue it walks into', () => {
    let checked = 0
    for (let a = 0; a < EVENTS; a++) {
      const e = f.event(a)
      const type = f.ev.type[e]!
      if (type !== MARKET_BUY && type !== MARKET_SELL) continue
      const before = f.ev.qBefore[e]!, after = f.ev.qAfter[e]!, size = f.ev.size[e]!
      if (f.ev.moved[e]) expect(size).toBeGreaterThanOrEqual(before)
      else expect(after).toBe(before - size)
      checked++
    }
    expect(checked).toBeGreaterThan(100)
  })
})
