import { describe, expect, it } from 'vitest'
import { POSTER_T, ROWS, SEED } from '../lib/market/flow'
import { MarketHost } from '../lib/market/host'
import { MIRROR_ROWS, Mirror } from '../lib/market/mirror'
import { FRAME_BYTES, readFrame } from '../lib/market/protocol'

/**
 * The page's side of /market (lib/market/mirror.ts): every frame from the
 * worker taken in as it arrives, before any view draws, so every view drawing
 * in the next animation frame draws the same market. Fed here by the worker's
 * own core in Node.
 */

function feed(model: Mirror, host: MarketHost, secs: number, from = 0) {
  const buf = new ArrayBuffer(FRAME_BYTES)
  let at = from
  for (; at <= from + secs * 1000; at += 1000 / 60) {
    const fan = host.frame(at, buf)
    model.take(readFrame(buf))
    if (fan) model.takeFan(fan)
  }
  return at
}

describe('the page’s market', () => {
  it('holds the market’s own rows, oldest first, the same numbers the flow wrote', () => {
    const host = new MarketHost(SEED, POSTER_T, () => 0)
    const model = new Mirror()
    feed(model, host, 5)
    const f = host.market.flow
    expect(model.rows).toBe(Math.min(MIRROR_ROWS, f.written))
    for (let age = 0; age < 40; age++) {
      const r = f.row(age)
      const i = model.row(age)
      expect(model.time(i)).toBe(f.times[r])
      expect(model.mid(i)).toBe(f.mids[r])
      expect(Array.from(model.levels(i))).toEqual(Array.from(f.queue.subarray(r * 160, (r + 1) * 160)))
    }
  })

  it('keeps every trade, a second of the market a second of history, and the last minutes at one a second', () => {
    const host = new MarketHost(SEED, POSTER_T, () => 0)
    const model = new Mirror()
    const seen: number[] = []
    const buf = new ArrayBuffer(FRAME_BYTES)
    // The host listens to the tape itself; count what the frames carry.
    for (let at = 0; at <= 20_000; at += 1000 / 60) {
      host.frame(at, buf)
      const f = readFrame(buf)
      for (let i = 0; i < f.nTrades; i++) seen.push(f.trades[i * 4]!)
      model.take(f)
    }
    expect(seen.length).toBeGreaterThan(100)
    expect(model.tradeCount).toBe(Math.min(seen.length, model.tradeCapacity))
    expect(model.trade(0).t).toBe(seen[seen.length - 1])
    // One sample a simulated second, each the market's volatility and stress at that second.
    const secs = model.history.length
    expect(secs).toBeGreaterThanOrEqual(20)
    for (let k = 1; k < secs; k++) expect(model.history.t(k) - model.history.t(k - 1)).toBe(1)
  })

  it('takes a shock in the frame that carries it, and says which frame that was', () => {
    const host = new MarketHost(SEED, POSTER_T, () => 0)
    const model = new Mirror()
    let at = feed(model, host, 1)
    expect(model.shocks).toBe(0)
    host.act('shock')
    const buf = new ArrayBuffer(FRAME_BYTES)
    host.frame((at += 1000 / 60), buf)
    model.take(readFrame(buf))
    expect(model.shocks).toBe(1)
    expect(model.landedSeq).toBe(model.seq)
    expect(model.landedT).toBe(host.market.log[0]!.q / 60)
    host.frame((at += 1000 / 60), buf)
    model.take(readFrame(buf))
    expect(model.landedSeq).toBe(model.seq - 1)
  })

  it('takes nothing from a buffer the worker gave back unwritten', () => {
    const host = new MarketHost(SEED, POSTER_T, () => 0)
    const model = new Mirror()
    feed(model, host, 1)
    const seq = model.seq, frames = model.frames
    const buf = new ArrayBuffer(FRAME_BYTES)
    model.take(readFrame(buf))
    expect([model.seq, model.frames]).toEqual([seq, frames])
  })

  it('starts over when the market does: a reset’s first frame replaces everything', () => {
    const host = new MarketHost(SEED, POSTER_T, () => 0)
    const model = new Mirror()
    let at = feed(model, host, 3)
    host.act('shock')
    at = feed(model, host, 1, at)
    host.reset()
    const buf = new ArrayBuffer(FRAME_BYTES)
    host.frame(at + 1000 / 60, buf)
    model.take(readFrame(buf))
    expect(model.rows).toBe(ROWS)
    expect(model.shocks).toBe(0)
    expect(model.time(model.row(0))).toBe(host.market.flow.times[host.market.flow.row(0)])
    expect(model.history.t(model.history.length - 1)).toBeLessThanOrEqual(host.market.t)
  })

  it('keeps the newest fan, and scales it to the price now: exact for geometric Brownian motion', () => {
    const host = new MarketHost(SEED, POSTER_T, () => 0)
    const model = new Mirror()
    feed(model, host, 1.2)
    const fan = model.fan!
    expect(fan).toBeTruthy()
    const mid = model.h.mid
    // The 95th percentile a year out, in dollars from ticks, is the unit fan's times the mid.
    expect(model.band(4, 64)).toBe(fan.bands[4 * 65 + 64]! * mid)
  })
})
