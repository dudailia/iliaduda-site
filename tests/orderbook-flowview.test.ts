import { describe, expect, it } from 'vitest'
import { CANCEL_ASK, CANCEL_BID, HAWKES, LIMIT_BUY, LIMIT_SELL, MARKET_BUY, MARKET_SELL, posterFlow } from '@/lib/market/flow'
import { LANES, causes, flowFrame, lamAt, pickEvent, recent } from '@/lib/orderbook/flowview'

/**
 * Fig. 2's view of the order flow: what each strip draws, per pixel column,
 * over the last ten simulated seconds. The intensity strip claims to be exact,
 * so it is checked against the model's intensity rebuilt independently from
 * the event times; the queue strip against the ring's own accounting; the
 * marks where a queue emptied against the events that emptied it.
 */

const f = posterFlow()
const t1 = f.t, t0 = t1 - 10, cols = 400
const w = (t1 - t0) / cols
const frame = flowFrame(f, { t0, t1, cols }, HAWKES)
const inWindow = (e: number) => f.ev.t[e]! >= t0 && f.ev.t[e]! < t1
const events = Array.from({ length: f.eventCount }, (_, a) => f.event(a)).filter(inWindow)

/**
 * A drawn type's intensity straight from the model: its baseline plus every earlier event's decaying kick, over the
 * whole ring (about 27 s; what came before it has decayed by e^-34 by the window's start).
 */
function direct(type: number, t: number) {
  let lam = HAWKES.mu[type]!
  for (let a = 0; a < f.eventCount; a++) {
    const e = f.event(a)
    const dt = t - f.ev.t[e]!
    if (dt <= 0) continue
    const src = f.ev.type[e]!
    lam += HAWKES.jump[type]![src]! * Math.exp(-HAWKES.decay[src]! * dt)
  }
  return lam
}

describe('the order-flow strips', () => {
  it('count every event in the window once, in its own lane', () => {
    expect(frame.counts.reduce((a, b) => a + b, 0)).toBe(events.length)
    for (const [lane, type] of LANES.entries()) {
      let n = 0
      for (let c = 0; c < cols; c++) n += frame.counts[lane * cols + c]!
      expect(n, `lane ${lane}`).toBe(events.filter((e) => f.ev.type[e] === type).length)
    }
  })

  it('draw each market order’s intensity exactly: just before each one it is the model’s own value there', () => {
    for (const [d, type] of [MARKET_BUY, MARKET_SELL].entries())
      for (const e of events.filter((x) => f.ev.type[x] === type)) {
        const t = f.ev.t[e]!
        const lam = lamAt(f, HAWKES, d, t)
        expect(lam / f.ev.lam[e]! - 1).toBeCloseTo(0, 9)
        expect(lam / direct(type, t) - 1).toBeCloseTo(0, 9)
      }
  })

  it('hold the whole intensity curve inside each column’s envelope', () => {
    for (let i = 0; i < 400; i++) {
      const t = t0 + ((i + 0.37) / 400) * (t1 - t0)
      const c = Math.floor((t - t0) / w)
      for (const [d, type] of [MARKET_BUY, MARKET_SELL].entries()) {
        const v = direct(type, t)
        expect(v).toBeGreaterThanOrEqual(frame.lam[d]!.min[c]! - 1e-9)
        expect(v).toBeLessThanOrEqual(frame.lam[d]!.max[c]! + 1e-9)
      }
    }
  })

  it('draw the queue at each touch as the ring accounts for it, event by event', () => {
    for (const [s, sideTypes] of [
      [0, [LIMIT_BUY, CANCEL_BID, MARKET_SELL]],
      [1, [LIMIT_SELL, CANCEL_ASK, MARKET_BUY]],
    ] as const) {
      const mine = events.filter((e) => (sideTypes as readonly number[]).includes(f.ev.type[e]!)).reverse()
      // Only this side's orders change this side's queues, so each one starts where the last left it.
      for (let i = 1; i < mine.length; i++) expect(f.ev.qBefore[mine[i]!]).toBe(f.ev.qAfter[mine[i - 1]!])
      // Each column ends on the queue after its last event (or carries the one before).
      let k = 0, q = f.ev.qBefore[mine[0]!]!
      for (let c = 0; c < cols; c++) {
        const end = t0 + (c + 1) * w
        while (k < mine.length && f.ev.t[mine[k]!]! < end) q = f.ev.qAfter[mine[k++]!]!
        expect(frame.queue[s]!.last[c], `side ${s} column ${c}`).toBe(q)
      }
    }
  })

  it('mark each moment a queue emptied and the price stepped, and only those', () => {
    const emptied = events.filter((e) => {
      const u = f.ev.type[e]!
      return f.ev.moved[e] === 1 && (u === MARKET_SELL || u === CANCEL_BID || u === MARKET_BUY || u === CANCEL_ASK)
    })
    expect(frame.emptied.map((m) => m.t).sort((a, b) => a - b)).toEqual(emptied.map((e) => f.ev.t[e]!).sort((a, b) => a - b))
    expect(frame.emptied.length).toBeGreaterThan(0)
  })

  it('read the share of the window’s events expected to have arrived on their own', () => {
    const own = events.reduce((s, e) => s + HAWKES.mu[f.ev.type[e]!]! / f.ev.lam[e]!, 0) / events.length
    expect(frame.own).toBeCloseTo(own, 12)
    expect(frame.own).toBeGreaterThan(0.3)
    expect(frame.own).toBeLessThan(0.8)
  })

  it('read the same share for the market orders alone, the ones the title is about: most of them are set off', () => {
    const market = events.filter((e) => f.ev.type[e] === MARKET_BUY || f.ev.type[e] === MARKET_SELL)
    const own = market.reduce((s, e) => s + HAWKES.mu[f.ev.type[e]!]! / f.ev.lam[e]!, 0) / market.length
    expect(frame.ownMarket).toBeCloseTo(own, 12)
    expect(1 - frame.ownMarket).toBeGreaterThan(0.5)
  })
})

describe('drawing the strips every frame', () => {
  it('reuses the last frame’s buffers when the window’s columns are the same, and gives the frame a fresh build gives', () => {
    const f = posterFlow()
    const win = (t1: number) => ({ t0: t1 - 10, t1, cols: 400 })
    const first = flowFrame(f, win(f.t), HAWKES)
    f.advance(f.t + 0.5)
    const again = flowFrame(f, win(f.t), HAWKES, first)
    const fresh = flowFrame(f, win(f.t), HAWKES)
    // The same buffers, refilled: no new arrays a frame.
    expect(again.counts).toBe(first.counts)
    expect(again.lam[0].min).toBe(first.lam[0].min)
    expect(again.queue[1].last).toBe(first.queue[1].last)
    expect([...again.counts]).toEqual([...fresh.counts])
    for (const k of ['lam', 'queue'] as const)
      for (const s of [0, 1] as const)
        for (const e of ['min', 'max', 'last'] as const) expect([...again[k][s][e]]).toEqual([...fresh[k][s][e]])
    expect(again.emptied).toEqual(fresh.emptied)
    expect(again.own).toBe(fresh.own)
    expect(again.events).toBe(fresh.events)
    // A different width is a different frame, built fresh.
    expect(flowFrame(f, { ...win(f.t), cols: 300 }, HAWKES, first).counts).not.toBe(first.counts)
  })
})

describe('reading one event', () => {
  it('finds the event under the pointer in its lane, and nothing where there is none', () => {
    const mb = events.find((e) => f.ev.type[e] === MARKET_BUY)!
    const age = Array.from({ length: f.eventCount }, (_, a) => a).find((a) => f.event(a) === mb)!
    const x = (f.ev.t[mb]! - t0) / (t1 - t0)
    expect(pickEvent(f, { t0, t1, cols }, x, LANES.indexOf(MARKET_BUY), 0.5 * w)).toBe(age)
    expect(pickEvent(f, { t0, t1, cols }, 1.5, LANES.indexOf(MARKET_BUY), w)).toBeNull()
  })

  it('lists the latest events newest first, each with its likeliest parent or the chance it came on its own', () => {
    const r = recent(f, HAWKES, 20)
    expect(r).toHaveLength(20)
    for (let i = 1; i < r.length; i++) expect(r[i]!.ago).toBeGreaterThanOrEqual(r[i - 1]!.ago)
    for (const e of r) {
      expect(e.own).toBeGreaterThan(0)
      expect(e.own).toBeLessThanOrEqual(1)
      if (e.parent) expect(e.parent.p).toBeGreaterThan(0)
    }
  })

  it('splits what set an order off by the kind of earlier order, beside the chance it came on its own', () => {
    // A market order is set off by the recent flow as a whole, not by one order: the likeliest single parent
    // carries a few percent, so the reading adds the parents up by kind, and the shares account for everything.
    for (const r of recent(f, HAWKES, 40)) {
      const c = causes(f, HAWKES, r.age)
      const total = c.own + c.byKind.reduce((a, k) => a + k.p, 0)
      expect(total).toBeCloseTo(1, 12)
      for (let i = 1; i < c.byKind.length; i++) expect(c.byKind[i]!.p).toBeLessThanOrEqual(c.byKind[i - 1]!.p)
      expect(c.own).toBeCloseTo(r.own, 12)
    }
  })
})

