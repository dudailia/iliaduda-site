import { describe, expect, it } from 'vitest'
import { Market } from '../lib/market/engine'
import { Flow, QUANTA, SEED } from '../lib/market/flow'
import { fingerprint } from '../lib/market/fingerprint'
import { Realised } from '../lib/market/realised'

/**
 * The engine behind /market: the order book's own market (lib/market/flow.ts),
 * with its realised volatility taken once a simulated second, advanced in
 * whole quanta so it is one market however it is stepped. The shock and the
 * stress arrive in their own tasks; this is the core they compose on.
 */

describe('the market engine', () => {
  it('is the order book’s market: from the same seed, the same book, clock, counts and tape as Flow’s own', () => {
    const m = new Market(SEED)
    const f = new Flow(SEED)
    m.advance(f.t + 20)
    f.advance(f.t + 20)
    expect(fingerprint(m.flow)).toBe(fingerprint(f))
  })

  it('is one market however it is stepped: single quanta, whole seconds and a long jump all agree, volatility too', () => {
    const a = new Market(7), b = new Market(7), c = new Market(7)
    const t0 = a.flow.t
    for (let i = 0; i < 20 * QUANTA; i++) a.step()
    for (let s = 1; s <= 20; s++) b.advance(t0 + s)
    c.advance(t0 + 20)
    expect(b.hash()).toBe(a.hash())
    expect(c.hash()).toBe(a.hash())
    expect(a.sigma).toBeGreaterThan(0)
  })

  it('takes its realised volatility from the mid once a simulated second, warm from the burn-in on', () => {
    const m = new Market(11)
    // Warm when it is first shown: the burn-in's returns are in it.
    expect(m.sigma).toBeGreaterThan(0.05)
    const r = new Realised(60)
    // A twin fed the same mids at whole seconds, from the same moment on, agrees once both have forgotten the start.
    const t0 = m.flow.t
    for (let s = 1; s <= 600; s++) {
      m.advance(t0 + s)
      r.push(m.flow.book.mid)
    }
    expect(Math.abs(m.sigma - r.sigma) / r.sigma).toBeLessThan(0.02)
  })

  it('runs at the model’s stationary rate: over ten simulated minutes, within 2% of (I − B)⁻¹μ', () => {
    const m = new Market(3)
    const n0 = m.flow.hawkes.counts.reduce((x, y) => x + y, 0)
    const t0 = m.flow.t
    m.advance(t0 + 600)
    const rate = (m.flow.hawkes.counts.reduce((x, y) => x + y, 0) - n0) / 600
    expect(Math.abs(rate / m.flow.expected - 1)).toBeLessThan(0.02)
  })
})

describe('the market’s hash compares its numbers to the bit', () => {
  it('tells apart two doubles one unit in the last place apart, and agrees on the same ones', async () => {
    const { bitsHash } = await import('../lib/market/fingerprint')
    const x = 0.2301234567891234
    const next = new Float64Array([x])
    new BigInt64Array(next.buffer)[0]! += 1n
    expect(bitsHash([x, 1, 2])).toBe(bitsHash([x, 1, 2]))
    expect(bitsHash([x, 1, 2])).not.toBe(bitsHash([next[0]!, 1, 2]))
  })
})

describe('each row keeps the market as it was written', () => {
  it('holds the realised volatility and stress of the quantum its row was written in', () => {
    const m = new Market(SEED)
    let seen = m.flow.written, checked = 0
    for (let q = 0; q < 5 * QUANTA; q++) {
      m.step()
      if (m.flow.written !== seen) {
        seen = m.flow.written
        const r = m.flow.row(0)
        expect(m.rowSigma[r]).toBe(m.sigma)
        expect(m.rowStress[r]).toBe(m.stress)
        checked++
      }
    }
    expect(checked).toBe(60)
  })
})
