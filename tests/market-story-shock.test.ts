import { describe, expect, it } from 'vitest'
import { Market } from '../lib/market/engine'
import { POSTER_T, QUANTA, SEED } from '../lib/market/flow'
import { MarketHost } from '../lib/market/host'
import { MARKET_SEQ } from '../lib/market/sequence'
import { FRAME_BYTES } from '../lib/market/protocol'

/**
 * /market's story lands its shock on one quantum, 2.5 simulated seconds after the figure's opening, whatever the
 * frames' timing: sent on the wall clock, it landed a quantum either side, and the same seeded market answered with a
 * 75% volatility or a 24% one. On that quantum, the page's market does what the paper says a shock does.
 */

const AT = POSTER_T + MARKET_SEQ.calm / 1000

function frames(host: MarketHost, ms: number, secs: number) {
  const buf = new ArrayBuffer(FRAME_BYTES)
  for (let at = 0; at <= secs * 1000 + 1e-9; at += ms) host.frame(at, buf)
}

describe('the story’s shock', () => {
  it('lands on the same quantum at any frame rate, as a straight run that takes it there', () => {
    const straight = new Market(SEED)
    straight.advance(AT)
    straight.apply('shock')
    straight.advance(POSTER_T + 6)
    for (const ms of [1000 / 60, 1000 / 120, 1000 / 47, 33]) {
      let t = 0
      const host = new MarketHost(SEED, POSTER_T, () => (t += 1))
      host.act('shock', AT)
      frames(host, ms, 6)
      // Run on to the same simulated time and compare the markets whole.
      host.market.advance(POSTER_T + 6)
      expect(host.market.hash()).toBe(straight.hash())
    }
  })

  it('on that quantum moves the page’s market as the paper says a shock does', () => {
    const m = new Market(SEED)
    m.advance(AT)
    const sigma0 = m.sigma
    m.apply('shock')
    let peak = 0
    for (let q = 0; q < QUANTA; q++) {
      m.advance(AT + (q + 1) / QUANTA)
      peak = Math.max(peak, m.stress)
    }
    expect(peak).toBeGreaterThan(0.8)
    m.advance(AT + 2)
    expect(m.sigma / sigma0).toBeGreaterThan(1.25)
    m.advance(AT + 10)
    const ten = m.sigma / sigma0
    expect(ten).toBeGreaterThanOrEqual(1.4)
    expect(ten).toBeLessThanOrEqual(5.6)
  })

  it('an action taken now drops the one waiting, and a Replay does too', () => {
    let t = 0
    const host = new MarketHost(SEED, POSTER_T, () => (t += 1))
    host.act('shock', AT)
    host.act('shock')
    frames(host, 1000 / 60, 6)
    expect(host.market.shock.delivered).toBeCloseTo(1, 6)
  })
})
