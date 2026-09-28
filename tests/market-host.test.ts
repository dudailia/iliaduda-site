import { describe, expect, it } from 'vitest'
import { FAN, Fan } from '../lib/futures/fan'
import { Market } from '../lib/market/engine'
import { POSTER_T, QUANTA, ROWS, SEED } from '../lib/market/flow'
import { HOST, MarketHost } from '../lib/market/host'
import { FRAME_BYTES, H, readFrame, type FanMsg } from '../lib/market/protocol'

/**
 * The worker's core (lib/market/host.ts), in Node: the market paced to the
 * page's frames, never catching up more than a tenth of a second at once, held
 * while paused or hidden, with its fan drawn in slices and its own load
 * measured. The worker file only passes messages to it.
 */

/** A clock that moves a millisecond each time it is read: the host reads it before and after each frame's work. */
function ticking() {
  let t = 0
  return () => (t += 1)
}

/** Frames every `ms` for `secs` of page time, from page time `from`; the fans that finish. */
function run(host: MarketHost, ms: number, secs: number, from = 0) {
  const buf = new ArrayBuffer(FRAME_BYTES)
  const fans: FanMsg[] = []
  let at = from
  for (; at <= from + secs * 1000 + 1e-9; at += ms) {
    const fan = host.frame(at, buf)
    if (fan) fans.push(fan)
  }
  return { buf, fans, at }
}

describe('the worker’s market', () => {
  it('starts where it is asked to, as the same market a straight run makes, with the full ring in its first frame', () => {
    const host = new MarketHost(SEED, POSTER_T, ticking())
    const m = new Market(SEED)
    m.advance(POSTER_T)
    expect(host.market.hash()).toBe(m.hash())
    const buf = new ArrayBuffer(FRAME_BYTES)
    host.frame(0, buf)
    expect(readFrame(buf).nRows).toBe(ROWS)
  })

  it('runs at the page’s clock, one market at 60 or 120 frames a second', () => {
    const a = new MarketHost(SEED, POSTER_T, ticking())
    const b = new MarketHost(SEED, POSTER_T, ticking())
    run(a, 1000 / 60, 30)
    run(b, 1000 / 120, 30)
    expect(Math.abs(a.market.t - (POSTER_T + 30))).toBeLessThan(1.01 / QUANTA)
    expect(b.market.flow.quanta).toBe(a.market.flow.quanta)
    expect(b.market.hash()).toBe(a.market.hash())
    const m = new Market(SEED)
    m.advance(a.market.t)
    expect(a.market.hash()).toBe(m.hash())
  })

  it('never catches up more than a tenth of a second at once: a page away thirty seconds finds it where it left it', () => {
    const host = new MarketHost(SEED, POSTER_T, ticking())
    const { at } = run(host, 1000 / 60, 2)
    const t = host.market.t
    const buf = new ArrayBuffer(FRAME_BYTES)
    host.frame(at + 30_000, buf)
    expect(host.market.t - t).toBeLessThanOrEqual(HOST.cap + 1 / QUANTA)
    const f = readFrame(buf)
    expect(f.h[H.held]).toBeGreaterThan(29.8)
  })

  it('holds while paused and carries on from there, and a shock waits for the next frame’s first quantum', () => {
    const host = new MarketHost(SEED, POSTER_T, ticking())
    let { at } = run(host, 1000 / 60, 1)
    host.pause()
    const t = host.market.t
    const buf = new ArrayBuffer(FRAME_BYTES)
    for (let i = 0; i < 60; i++) host.frame((at += 1000 / 60), buf)
    expect(host.market.t).toBe(t)
    expect(readFrame(buf).h[H.paused]).toBe(1)
    host.resume()
    const q = host.market.flow.quanta
    host.act('shock')
    expect(host.market.log).toHaveLength(0)
    host.frame((at += 1000 / 60), buf)
    expect(host.market.log).toEqual([{ q, action: 'shock' }])
    expect(readFrame(buf).h[H.shocks]).toBe(1)
  })

  it('draws a fan at the start and at each new simulated second, from a price of 1 at the market’s volatility, in slices', () => {
    const host = new MarketHost(SEED, POSTER_T, ticking())
    const { fans } = run(host, 1000 / 60, 3.05)
    expect(fans.length).toBeGreaterThanOrEqual(3)
    expect(fans.map((f) => f.seq)).toEqual(fans.map((_, i) => i + 1))
    // Each one is the fan itself, at the volatility the market had in that second.
    const f = fans[1]!
    const m = new Market(SEED)
    m.advance(f.t)
    expect(f.sigma).toBe(m.sigma)
    const want = new Fan()
    want.begin(1, f.sigma)
    while (!want.work(4096));
    expect(Array.from(f.bands)).toEqual(Array.from(want.bandsData()))
    expect(Array.from(f.strands)).toEqual(Array.from(want.strands()))
    expect(f.paths).toBe(FAN.paths)
    // In slices: no frame draws more than its share.
    expect(HOST.pathsPerFrame * Math.ceil(FAN.paths / HOST.pathsPerFrame)).toBeGreaterThanOrEqual(FAN.paths)
  })

  it('measures itself: futures drawn a second of its own time, its busy share and the simulated seconds a wall second', () => {
    const host = new MarketHost(SEED, POSTER_T, ticking())
    const { buf } = run(host, 1000 / 60, 3)
    const h = readFrame(buf).h
    // The clock is read before and after each frame, and around each slice of a fan: a slice of 512 paths costs a
    // millisecond, so it draws them at 512,000 a second of its own time.
    expect(h[H.paths]).toBe(HOST.pathsPerFrame * 1000)
    // A frame costs a millisecond, a frame with a slice three; eight slices a fan, a fan a second, sixty frames.
    expect(h[H.busy]).toBeGreaterThan((60 + 2 * 8) / 1000 - 0.01)
    expect(h[H.busy]).toBeLessThan((60 + 2 * 8) / 1000 + 0.02)
    expect(h[H.speed]).toBeCloseTo(1, 2)
  })

  it('resets to the market it started as', () => {
    const host = new MarketHost(SEED, POSTER_T, ticking())
    const start = host.market.hash()
    run(host, 1000 / 60, 2)
    host.act('shock')
    run(host, 1000 / 60, 1, 2100)
    host.reset()
    expect(host.market.hash()).toBe(start)
    expect(host.market.log).toHaveLength(0)
    const buf = new ArrayBuffer(FRAME_BYTES)
    host.frame(5000, buf)
    expect(readFrame(buf).nRows).toBe(ROWS)
  })
})
