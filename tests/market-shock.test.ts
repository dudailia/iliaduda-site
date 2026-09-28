import { beforeAll, describe, expect, it } from 'vitest'
import type { Trade } from '../lib/market/book'
import { Market } from '../lib/market/engine'
import { QUANTA } from '../lib/market/flow'
import { SHOCK, Shock } from '../lib/market/shock'

/**
 * The liquidity shock, what "Liquidity shock" on /market does: at the next
 * quantum a market sell takes every bid within twenty ticks of the best, and
 * the Hawkes state takes an exogenous excitation (market sells cluster, bids
 * are cancelled); what follows is the model's own. Held to its claims over
 * twenty seeds, each shocked ten simulated seconds after its burn-in.
 */

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1)

interface Run {
  seed: number
  spread1s: number
  touch1s: number
  over8: number
  sigma2s: number
  sigma10s: number
  spreadBack: number
  calm: number
}

/** Seed `seed`, shocked, watched a quantum at a time for five simulated minutes. */
function watch(seed: number): Run {
  const m = new Market(seed)
  m.advance(m.t + 10)
  const pre = { touch: m.touch, sigma: m.sigma }
  m.apply('shock')
  const q0 = m.flow.quanta
  const run: Run = { seed, spread1s: 0, touch1s: Infinity, over8: Infinity, sigma2s: 0, sigma10s: 0, spreadBack: Infinity, calm: Infinity }
  while (m.flow.quanta < q0 + 300 * QUANTA) {
    m.step()
    const t = (m.flow.quanta - q0) / QUANTA
    const spread = m.flow.book.spread
    if (t <= 1) {
      run.spread1s = Math.max(run.spread1s, spread)
      run.touch1s = Math.min(run.touch1s, m.touch / pre.touch)
    }
    if (t <= 2) run.sigma2s = Math.max(run.sigma2s, m.sigma / pre.sigma)
    if (t <= 10) run.sigma10s = Math.max(run.sigma10s, m.sigma / pre.sigma)
    if (run.over8 === Infinity && m.stress >= 0.8) run.over8 = t
    if (run.spreadBack === Infinity && spread <= 2) run.spreadBack = t
    if (run.calm === Infinity && t > 5 && m.stress < 0.05) run.calm = t
  }
  return run
}

describe('the liquidity shock', () => {
  it('lands at the next quantum: a market sell takes every bid within twenty ticks of the best, each fill on the tape', () => {
    const m = new Market(5)
    m.advance(m.t + 10)
    const b = m.flow.book
    const best = b.bestBid
    let depth = 0
    for (let p = best; p > best - SHOCK.ticks; p--) depth += b.bidAt(p)
    const tape: Trade[] = []
    m.flow.onTrade = (tr) => tape.push(tr)
    m.apply('shock')
    // Nothing yet: the shock waits for the quantum's start.
    expect(b.bestBid).toBe(best)
    expect(tape).toHaveLength(0)
    const t0 = m.t
    const q = m.flow.quanta
    m.step()
    const swept = tape.filter((tr) => tr.t === t0)
    expect(swept.length).toBeGreaterThan(1)
    expect(swept.every((tr) => tr.side === -1 && tr.price <= best && tr.price > best - SHOCK.ticks)).toBe(true)
    expect(swept.reduce((a, tr) => a + tr.size, 0)).toBe(depth)
    expect(m.log).toEqual([{ q, action: 'shock' }])
  })

  describe('over twenty seeds', () => {
    let runs: Run[] = []
    beforeAll(() => {
      runs = SEEDS.map(watch)
    }, 600_000)

    it('within a second, the spread is at least four ticks and the touch has lost four fifths of its shares', () => {
      for (const r of runs) {
        expect(r.spread1s, `seed ${r.seed}`).toBeGreaterThanOrEqual(4)
        expect(r.touch1s, `seed ${r.seed}`).toBeLessThan(0.2)
      }
    })

    it('the stress passes 0.8 within a second, and realised volatility is up by a quarter within two', () => {
      for (const r of runs) {
        expect(r.over8, `seed ${r.seed}`).toBeLessThanOrEqual(1)
        expect(r.sigma2s, `seed ${r.seed}`).toBeGreaterThan(1.25)
      }
    })

    it('lifts realised volatility several times over: within ten seconds, a median of twice its level or more, never six', () => {
      // 1.37 to 5.57 times, median 2.8.
      const peaks = runs.map((r) => r.sigma10s).sort((a, b) => a - b)
      expect(peaks[9]! + peaks[10]!).toBeGreaterThan(4)
      expect(peaks[19]!).toBeLessThan(6)
    })

    it('relaxes: the spread is back within two ticks inside two seconds, the stress below 0.05 inside five minutes', () => {
      for (const r of runs) {
        expect(r.spreadBack, `seed ${r.seed}`).toBeLessThanOrEqual(2)
        expect(r.calm, `seed ${r.seed}`).toBeLessThanOrEqual(300)
      }
    })
  })

  it('replays: the same seed and the same log are the same market, however it is stepped', () => {
    const a = new Market(9)
    a.advance(a.t + 5)
    a.apply('shock')
    a.advance(a.t + 3)
    a.apply('shock')
    a.apply('shock')
    a.advance(a.t + 20)
    expect(a.log).toHaveLength(3)
    const b = new Market(9)
    b.replay(a.log)
    b.advance(a.t)
    expect(b.hash()).toBe(a.hash())
    const c = new Market(9)
    c.replay(a.log)
    while (c.flow.quanta < a.flow.quanta) c.step()
    expect(c.hash()).toBe(a.hash())
    // And a shock is not nothing: without it, another market.
    const d = new Market(9)
    d.advance(a.t)
    expect(d.hash()).not.toBe(a.hash())
  })

  it('stacks only up to its cap: fifty presses in a second leave every state bounded', () => {
    const m = new Market(4)
    m.advance(m.t + 10)
    const mid0 = m.flow.book.mid
    const q0 = m.flow.quanta
    let pressed = 0
    let worst = { load: 0, pressure: 0, spread: 0, drop: 0, sigma: 0 }
    let delivered = 0
    while (m.flow.quanta < q0 + 120 * QUANTA) {
      const i = m.flow.quanta - q0
      if (i < QUANTA && pressed < 50 && i >= (pressed * QUANTA) / 50) {
        m.apply('shock')
        pressed++
      }
      m.step()
      if (i === QUANTA - 1) delivered = m.shock.delivered
      const b = m.flow.book
      expect(b.bestBid).toBeLessThan(b.bestAsk)
      expect(m.stress).toBeGreaterThanOrEqual(0)
      expect(m.stress).toBeLessThanOrEqual(1)
      worst = {
        load: Math.max(worst.load, m.shock.load),
        pressure: Math.max(worst.pressure, m.pressure),
        spread: Math.max(worst.spread, b.spread),
        drop: Math.max(worst.drop, mid0 - b.mid),
        sigma: Math.max(worst.sigma, m.sigma),
      }
    }
    expect(pressed).toBe(50)
    expect(m.log).toHaveLength(50)
    expect(worst.load).toBeLessThanOrEqual(SHOCK.cap)
    // One shock, and what the load let go of in that second held at the cap: 1 + ln 2 / 5, about 1.14 shocks.
    expect(delivered).toBeLessThanOrEqual(SHOCK.cap * (1 + QUANTA * (1 - 2 ** (-1 / (SHOCK.halfLife * QUANTA)))) + 1e-9)
    // And the market with it (seed 4: 4.7 ×, 22 ticks, 70.5 ticks, 151%): the pressure no more than one shock's lift and
    // its echo, the spread and the fall a few shocks' worth, σ̂ within ten times calm.
    expect(worst.pressure).toBeLessThan(6)
    expect(worst.spread).toBeLessThan(40)
    expect(worst.drop).toBeLessThan(150)
    expect(worst.sigma).toBeLessThan(2.5)
  }, 120_000)
})

describe('the shock’s load', () => {
  it('delivers a whole shock when the market is calm, and nothing more while it is all still in', () => {
    const s = new Shock()
    expect(s.press()).toBe(1)
    expect(s.press()).toBe(0)
    expect(s.load).toBe(SHOCK.cap)
  })

  it('is absorbed on its half-life, and the market is absorbing while more than half a shock is in', () => {
    const s = new Shock()
    s.press()
    expect(s.absorbing).toBe(true)
    for (let i = 0; i < SHOCK.halfLife * QUANTA; i++) s.decay()
    expect(s.load).toBeCloseTo(0.5, 9)
    s.decay()
    expect(s.absorbing).toBe(false)
    // What was let go of can be pressed again, and no more.
    expect(s.press()).toBeCloseTo(0.5, 2)
    expect(s.load).toBe(SHOCK.cap)
  })
})
