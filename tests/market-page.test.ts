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

  it('keeps every trade, and the market as each row was written: its volatility and stress there', () => {
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
    // Every row carries the market's volatility and stress when it was written.
    const f = host.market
    for (const age of [0, 5, 100]) {
      const i = model.row(age), r = f.flow.row(age)
      expect(model.sigma(i)).toBe(f.rowSigma[r])
      expect(model.stress(i)).toBe(f.rowStress[r])
    }
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
  })

  it('starts over on a reset even when the new market’s clock runs past the old one: a market opened held, then Replay', () => {
    const host = new MarketHost(SEED, POSTER_T, () => 0)
    const model = new Mirror()
    host.pause()
    const buf = new ArrayBuffer(FRAME_BYTES)
    host.frame(0, buf)
    model.take(readFrame(buf))
    const q = model.h.quanta
    host.resume()
    host.reset()
    // The first frame after a long wait moves the new market on by the whole cap, past where the old one held.
    host.frame(5_000, buf)
    model.take(readFrame(buf))
    expect(model.h.quanta).toBeGreaterThan(q)
    expect(model.h.resets).toBe(1)
    expect(model.taken).toBe(model.rows)
    expect(model.time(model.row(0))).toBe(host.market.flow.times[host.market.flow.row(0)])
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
