import { CANCEL_ASK, CANCEL_BID, LIMIT_BUY, LIMIT_SELL, MARKET_BUY, MARKET_SELL, attribute, type Flow } from '@/lib/market/flow'
import type { HawkesParams } from '@/lib/market/hawkes'

/**
 * Fig. 2's view of the order flow (components/figures/orderflow): the last
 * ten simulated seconds of the market's event ring, reduced to what each strip
 * draws in each pixel column. Pure, so it is tested against the model itself
 * (tests/orderbook-flowview.test.ts), and shared by the live figure and its
 * server poster.
 *
 * The intensity strip is exact. Between two events every intensity only
 * decays, as a sum of exponentials whose coefficients the ring stores (each
 * market-order type's excitation by each source type, just after each event),
 * so the curve is known at every moment. A column's envelope is the curve's
 * least and greatest values inside it, and those fall at its edges and at its
 * events: the foot and the top of each jump.
 */

/** The window, in simulated seconds. */
export const SECONDS = 10
/** Lanes, top to bottom: the three kinds of order that change the bid side's queues, then the ask side's three. */
export const LANES = [LIMIT_BUY, CANCEL_BID, MARKET_SELL, MARKET_BUY, CANCEL_ASK, LIMIT_SELL] as const
export const LANE_NAMES = ['Limit buys', 'Cancelled bids', 'Market sells', 'Market buys', 'Cancelled asks', 'Limit sells'] as const
/** Event type → its lane. */
export const LANE_OF: readonly number[] = LANES.reduce<number[]>((a, u, i) => ((a[u] = i), a), [])
/** The intensities drawn, in the ring's excitation layout (lib/market/flow.ts): market buys, then market sells. */
export const DRAWN = [MARKET_BUY, MARKET_SELL] as const
/** Each type's name, for the reading and the table. */
export const NAMES: readonly string[] = LANES.reduce<string[]>((a, u, i) => ((a[u] = LANE_NAMES[i]!.replace(/s$/, '').toLowerCase()), a), [])

const bidSide = (u: number) => u === LIMIT_BUY || u === CANCEL_BID || u === MARKET_SELL
/** The orders that take shares from a touch: when one leaves it empty, the price steps. */
const takes = (u: number) => u === MARKET_SELL || u === CANCEL_BID || u === MARKET_BUY || u === CANCEL_ASK

export interface Win {
  t0: number
  t1: number
  cols: number
}

/** A curve's least, greatest and final value in each column. */
export interface Envelope {
  min: Float64Array
  max: Float64Array
  last: Float64Array
}

export interface FlowFrame {
  /** The window drawn: from t0 to t1, simulated seconds. */
  t0: number
  t1: number
  /** Events per lane and column, lane by lane. */
  counts: Uint16Array
  /** Intensity of market buys and of market sells, per second. */
  lam: [Envelope, Envelope]
  /** Shares queued at the best bid and at the best ask. */
  queue: [Envelope, Envelope]
  /** Each moment a queue was emptied and the price stepped: 0 the bid, 1 the ask. */
  emptied: { t: number; side: 0 | 1; age: number }[]
  events: number
  /** Mean over the window's events of μ/λ(t⁻): the share expected to have arrived on their own, not set off. */
  own: number
}

/** The decay rates the model uses, each with the source types that decay at it: two exponentials per value, not six. */
function rates(p: HawkesParams): { beta: number; src: number[] }[] {
  const out: { beta: number; src: number[] }[] = []
  p.decay.forEach((b, j) => {
    const g = out.find((x) => x.beta === b)
    if (g) g.src.push(j)
    else out.push({ beta: b, src: [j] })
  })
  return out
}

/** Drawn type `d`'s intensity at time t ≥ the time of ring event e, from e's stored excitation (no event between). */
function after(f: Flow, p: HawkesParams, groups: { beta: number; src: number[] }[], e: number, d: number, t: number): number {
  const o = (e * DRAWN.length + d) * 6
  const dt = t - f.ev.t[e]!
  let lam = p.mu[DRAWN[d]!]!
  for (const g of groups) {
    let s = 0
    for (const j of g.src) s += f.ev.exc[o + j]!
    if (s) lam += s * Math.exp(-g.beta * dt)
  }
  return lam
}

/** Drawn type `d`'s intensity just before time t: from the latest event before t, or the baseline if there is none. */
export function lamAt(f: Flow, p: HawkesParams, d: number, t: number): number {
  const groups = rates(p)
  for (let a = 0; a < f.eventCount; a++) {
    const e = f.event(a)
    if (f.ev.t[e]! < t) return after(f, p, groups, e, d, t)
  }
  return p.mu[DRAWN[d]!]!
}

/** Ages of the window's oldest and newest events (−1 if it has none), and of the latest event before it. */
function span(f: Flow, win: Win) {
  let oldest = -1, newest = -1, before = -1
  for (let a = 0; a < f.eventCount; a++) {
    const t = f.ev.t[f.event(a)]!
    if (t >= win.t1) continue
    if (t < win.t0) {
      before = a
      break
    }
    if (newest < 0) newest = a
    oldest = a
  }
  return { oldest, newest, before }
}

export function flowFrame(f: Flow, win: Win, p: HawkesParams): FlowFrame {
  const { t0, t1, cols } = win
  const w = (t1 - t0) / cols
  const colOf = (t: number) => Math.min(cols - 1, Math.max(0, Math.floor((t - t0) / w)))
  const env = (): Envelope => ({ min: new Float64Array(cols).fill(Infinity), max: new Float64Array(cols).fill(-Infinity), last: new Float64Array(cols).fill(NaN) })
  const put = (E: Envelope, c: number, v: number) => {
    if (v < E.min[c]!) E.min[c] = v
    if (v > E.max[c]!) E.max[c] = v
    E.last[c] = v
  }
  const counts = new Uint16Array(LANES.length * cols)
  const lam: [Envelope, Envelope] = [env(), env()]
  const queue: [Envelope, Envelope] = [env(), env()]
  const emptied: FlowFrame['emptied'] = []
  const { oldest, newest, before } = span(f, win)
  const groups = rates(p)
  const ages: number[] = []
  if (oldest >= 0) for (let a = oldest; a >= newest; a--) ages.push(a)

  // Events: counts per lane and column, the moments a touch was emptied, and the share arriving on their own.
  let own = 0
  for (const a of ages) {
    const e = f.event(a)
    const u = f.ev.type[e]!
    const i = LANE_OF[u]! * cols + colOf(f.ev.t[e]!)
    counts[i] = counts[i]! + 1
    own += p.mu[u]! / f.ev.lam[e]!
    if (takes(u) && f.ev.moved[e] === 1) emptied.push({ t: f.ev.t[e]!, side: bidSide(u) ? 0 : 1, age: a })
  }

  // Intensities: decay across each column edge, then each event's foot and top.
  for (let d = 0; d < DRAWN.length; d++) {
    const E = lam[d]!
    let e0 = before >= 0 ? f.event(before) : -1
    const val = (t: number) => (e0 >= 0 ? after(f, p, groups, e0, d, t) : p.mu[DRAWN[d]!]!)
    let tc = t0
    put(E, 0, val(t0))
    const edges = (to: number) => {
      for (let k = colOf(tc) + 1; k <= to; k++) {
        const v = val(t0 + k * w)
        put(E, k - 1, v)
        put(E, k, v)
      }
    }
    for (const a of ages) {
      const e = f.event(a)
      const te = f.ev.t[e]!
      const c = colOf(te)
      edges(c)
      put(E, c, val(te))
      e0 = e
      put(E, c, val(te))
      tc = te
    }
    edges(cols - 1)
    put(E, cols - 1, val(t1))
  }

  // Queues at each touch: a step at each of that side's events, carried across the columns between them.
  for (const s of [0, 1] as const) {
    const Q = queue[s]
    const mine = ages.map((a) => f.event(a)).filter((e) => bidSide(f.ev.type[e]!) === (s === 0))
    let q = mine.length ? f.ev.qBefore[mine[0]!]! : s === 0 ? f.book.bidAt(f.book.bestBid) : f.book.askAt(f.book.bestAsk)
    let tc = t0
    put(Q, 0, q)
    const carry = (to: number) => {
      for (let k = colOf(tc) + 1; k <= to; k++) {
        put(Q, k - 1, q)
        put(Q, k, q)
      }
    }
    for (const e of mine) {
      const te = f.ev.t[e]!
      const c = colOf(te)
      carry(c)
      put(Q, c, f.ev.qBefore[e]!)
      q = f.ev.qAfter[e]!
      put(Q, c, q)
      tc = te
    }
    carry(cols - 1)
    put(Q, cols - 1, q)
  }

  return { t0, t1, counts, lam, queue, emptied, events: ages.length, own: ages.length ? own / ages.length : 0 }
}

/** The event in `lane` nearest the pointer (x: 0 at the window's start, 1 at now), within `tol` seconds; its age. */
export function pickEvent(f: Flow, win: Win, x: number, lane: number, tol: number): number | null {
  const tx = win.t0 + x * (win.t1 - win.t0)
  const type = LANES[lane]
  let best: number | null = null, gap = tol
  for (let a = 0; a < f.eventCount; a++) {
    const e = f.event(a)
    const t = f.ev.t[e]!
    if (t < win.t0 || t < tx - tol) break
    if (t >= win.t1 || f.ev.type[e] !== type) continue
    const g = Math.abs(t - tx)
    if (g <= gap) {
      gap = g
      best = a
    }
  }
  return best
}

export interface Recent {
  age: number
  /** Seconds before now. */
  ago: number
  type: number
  price: number
  size: number
  /** The chance it arrived on its own, not set off by an earlier event. */
  own: number
  /** Its likeliest parent, and the chance that one set it off. */
  parent: { age: number; ago: number; type: number; p: number } | null
}

/** One event, read: what it was, where, and what most likely set it off. */
export function readEvent(f: Flow, p: HawkesParams, age: number): Recent | null {
  const e = f.event(age)
  if (e < 0) return null
  const r = attribute(f, age, p)
  const top = r.top
  return {
    age,
    ago: f.t - f.ev.t[e]!,
    type: f.ev.type[e]!,
    price: f.ev.price[e]!,
    size: f.ev.size[e]!,
    own: r.immigrant,
    parent: top ? { age: top.age, ago: f.t - f.ev.t[f.event(top.age)]!, type: f.ev.type[f.event(top.age)]!, p: top.p } : null,
  }
}

export interface Causes {
  /** The chance the order arrived on its own, not set off by an earlier one. */
  own: number
  /** The chance it was set off by an earlier order of each kind, likeliest first; kinds with no chance left out. */
  byKind: { type: number; p: number }[]
}

/**
 * What set the order `age` events ago off, as the branching structure has it
 * (attribute, lib/market/flow.ts). A market order's intensity is mostly the
 * sum of many small, decaying kicks, so its likeliest single parent carries
 * only a few percent: the shares are added up by the kind of earlier order,
 * and they account, with the chance it came on its own, for all of it.
 */
export function causes(f: Flow, p: HawkesParams, age: number): Causes {
  const a = attribute(f, age, p)
  const sum = new Map<number, number>()
  for (const q of a.parents) {
    const u = f.ev.type[f.event(q.age)]!
    sum.set(u, (sum.get(u) ?? 0) + q.p)
  }
  const byKind = [...sum].map(([type, share]) => ({ type, p: share })).sort((x, y) => y.p - x.p)
  return { own: a.immigrant, byKind }
}

/** The latest n events, newest first. */
export function recent(f: Flow, p: HawkesParams, n: number): Recent[] {
  const out: Recent[] = []
  for (let a = 0; a < Math.min(n, f.eventCount); a++) out.push(readEvent(f, p, a)!)
  return out
}
