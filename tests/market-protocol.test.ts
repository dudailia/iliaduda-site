import { describe, expect, it } from 'vitest'
import type { Trade } from '../lib/market/book'
import { Market } from '../lib/market/engine'
import { HALF, HZ, LEVELS, POSTER_T, QUANTA, ROWS } from '../lib/market/flow'
import { writeFrame } from '../lib/market/frame'
import { FRAME_BYTES, H, MAX_ROWS, MAX_TRADES, PROTOCOL, ROW_META, readFrame } from '../lib/market/protocol'

/**
 * The worker's frames: the market as it is at the frame, the order book at
 * "now", and the rows and trades since the last frame, in one transferable
 * buffer the page reads in place. The layout is the protocol's; these tests
 * write a real market and read it back.
 */

const stats = { paths: 12_000, busy: 0.02, held: 1.5, speed: 1, fanSeq: 3, paused: false }

function watched(seed = 7) {
  const m = new Market(seed)
  const tape: Trade[] = []
  m.flow.onTrade = (tr) => tape.push(tr)
  m.advance(POSTER_T)
  return { m, tape }
}

describe('the worker’s frames', () => {
  it('agree with the market on its layout: a row is the flow’s own, and the buffer holds a full ring and tape', () => {
    expect(PROTOCOL.levels).toBe(LEVELS)
    expect(PROTOCOL.half).toBe(HALF)
    expect(PROTOCOL.quanta).toBe(QUANTA)
    expect(PROTOCOL.hz).toBe(HZ)
    expect(MAX_ROWS).toBe(ROWS)
    expect(FRAME_BYTES % 8).toBe(0)
  })

  it('carry the market as it is: its clock, book, volatility, stress, pressure, shock and rates', () => {
    const { m, tape } = watched()
    m.apply('shock')
    m.advance(m.t + 2)
    const buf = new ArrayBuffer(FRAME_BYTES)
    writeFrame(buf, { market: m, seq: 41, rowsFrom: m.flow.written - 3, trades: tape, stats })
    const f = readFrame(buf)
    const b = m.flow.book
    const s = m.flow.stats()
    expect(f.h[H.version]).toBe(PROTOCOL.version)
    expect(f.h[H.seq]).toBe(41)
    expect(f.h[H.t]).toBe(m.t)
    expect(f.h[H.quanta]).toBe(m.flow.quanta)
    expect([f.h[H.mid], f.h[H.spread], f.h[H.bestBid], f.h[H.bestAsk]]).toEqual([b.mid, b.spread, b.bestBid, b.bestAsk])
    expect([f.h[H.sigma], f.h[H.stress], f.h[H.pressure], f.h[H.touch]]).toEqual([m.sigma, m.stress, m.pressure, m.touch])
    expect([f.h[H.load], f.h[H.absorbing], f.h[H.shocks]]).toEqual([m.shock.load, m.shock.absorbing ? 1 : 0, 1])
    expect(f.h[H.shockQ]).toBe(m.log[0]!.q)
    expect([f.h[H.rate], f.h[H.expected], f.h[H.trades], f.h[H.shares]]).toEqual([s.rate, m.flow.expected, s.trades, s.shares])
    expect([f.h[H.paths], f.h[H.busy], f.h[H.held], f.h[H.speed], f.h[H.fanSeq], f.h[H.paused]]).toEqual([12_000, 0.02, 1.5, 1, 3, 0])
    expect(f.h[H.written]).toBe(m.flow.written)
  })

  it('carry the order book at now, laid out as a row is: bids below the best bid, asks above the best ask', () => {
    const { m } = watched()
    // At a row's own moment the book at now is that row.
    const buf = new ArrayBuffer(FRAME_BYTES)
    writeFrame(buf, { market: m, seq: 1, rowsFrom: m.flow.written, trades: [], stats })
    const f = readFrame(buf)
    const r = m.flow.row(0)
    expect(f.h[H.centre]).toBe(m.flow.centre[r])
    expect(Array.from(f.ladder)).toEqual(Array.from(m.flow.queue.subarray(r * LEVELS, (r + 1) * LEVELS)))
    // Between rows, it is the book itself.
    m.flow.step()
    m.flow.step()
    writeFrame(buf, { market: m, seq: 2, rowsFrom: m.flow.written, trades: [], stats })
    const g = readFrame(buf)
    const b = m.flow.book
    const c = g.h[H.centre]!
    for (let j = 0; j < LEVELS; j++) {
      const price = c - HALF + j
      const want = price <= b.bestBid ? b.bidAt(price) : price >= b.bestAsk ? b.askAt(price) : 0
      expect(g.ladder[j], `level ${j}`).toBe(want)
    }
  })

  it('carry the rows since the last frame, oldest first and whole, and a full ring when the page has none', () => {
    const { m } = watched()
    const buf = new ArrayBuffer(FRAME_BYTES)
    writeFrame(buf, { market: m, seq: 1, rowsFrom: 0, trades: [], stats })
    const all = readFrame(buf)
    expect(all.nRows).toBe(ROWS)
    const from = m.flow.written
    m.advance(m.t + 1)
    writeFrame(buf, { market: m, seq: 2, rowsFrom: from, trades: [], stats })
    const f = readFrame(buf)
    expect(f.nRows).toBe(12)
    for (let i = 0; i < f.nRows; i++) {
      const r = m.flow.row(f.nRows - 1 - i)
      const meta = f.rowMeta.subarray(i * ROW_META, (i + 1) * ROW_META)
      expect(Array.from(meta)).toEqual([
        m.flow.times[r],
        m.flow.centre[r],
        m.flow.mids[r],
        m.flow.bids[r],
        m.flow.asks[r],
        m.flow.bidQueue[r],
        m.flow.askQueue[r],
        m.flow.events[r],
      ])
      expect(Array.from(f.rows.subarray(i * LEVELS, (i + 1) * LEVELS))).toEqual(Array.from(m.flow.queue.subarray(r * LEVELS, (r + 1) * LEVELS)))
    }
  })

  it('carry the trades since the last frame, and the newest ones when there are more than fit', () => {
    const { m, tape } = watched()
    tape.length = 0
    m.apply('shock')
    m.advance(m.t + 1)
    const buf = new ArrayBuffer(FRAME_BYTES)
    writeFrame(buf, { market: m, seq: 1, rowsFrom: m.flow.written, trades: tape, stats })
    const f = readFrame(buf)
    expect(f.nTrades).toBe(tape.length)
    for (let i = 0; i < tape.length; i++) expect(Array.from(f.trades.subarray(i * 4, i * 4 + 4))).toEqual([tape[i]!.t, tape[i]!.price, tape[i]!.size, tape[i]!.side])
    const many: Trade[] = Array.from({ length: MAX_TRADES + 10 }, (_, i) => ({ t: i, price: 10_000 - i, size: 1 + (i % 7), side: i % 2 ? 1 : -1 }))
    writeFrame(buf, { market: m, seq: 2, rowsFrom: m.flow.written, trades: many, stats })
    const g = readFrame(buf)
    expect(g.nTrades).toBe(MAX_TRADES)
    expect(g.h[H.dropped]).toBe(10)
    expect(g.trades[0]).toBe(10)
    expect(g.trades[(MAX_TRADES - 1) * 4]).toBe(MAX_TRADES + 9)
  })

  it('say so when the page is too far behind for the ring: the rows it holds, and how many it lost', () => {
    const { m } = watched()
    const from = m.flow.written
    m.advance(m.t + ROWS / 12 + 5)
    const buf = new ArrayBuffer(FRAME_BYTES)
    writeFrame(buf, { market: m, seq: 1, rowsFrom: from, trades: [], stats })
    const f = readFrame(buf)
    expect(f.nRows).toBe(ROWS)
    expect(f.h[H.lostRows]).toBe(m.flow.written - from - ROWS)
    expect(f.rowMeta[(ROWS - 1) * ROW_META]).toBe(m.flow.times[m.flow.row(0)])
  })
})
