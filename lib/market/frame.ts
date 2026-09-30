import type { Trade } from './book'
import type { Market } from './engine'
import { HALF, LEVELS, ROWS } from './flow'
import { H, MAX_TRADES, PROTOCOL, ROW_META, frameViews } from './protocol'

/** The worker's own numbers for a frame (lib/market/host.ts). */
export interface FrameStats {
  paths: number
  busy: number
  held: number
  speed: number
  fanSeq: number
  paused: boolean
  resets: number
}

export interface FrameSource {
  market: Market
  seq: number
  /** Rows the page already has: the flow's `written` at the page's last frame. */
  rowsFrom: number
  /** Trades since the page's last frame, oldest first. */
  trades: readonly Trade[]
  stats: FrameStats
}

/**
 * Writes a frame (lib/market/protocol.ts) into `buf`: the worker's side. The ladder is the book at now in a row's
 * layout, centred on the rounded mid as a row is, so the page draws the two the same way.
 */
export function writeFrame(buf: ArrayBuffer, src: FrameSource): void {
  const v = frameViews(buf)
  const { market: m, stats } = src
  const f = m.flow
  const b = f.book
  const s = f.stats()
  const h = v.h
  h.fill(0)
  h[H.version] = PROTOCOL.version
  h[H.seq] = src.seq
  h[H.t] = m.t
  h[H.quanta] = f.quanta
  h[H.mid] = b.mid
  h[H.spread] = b.spread
  h[H.bestBid] = b.bestBid
  h[H.bestAsk] = b.bestAsk
  h[H.sigma] = m.sigma
  h[H.stress] = m.stress
  h[H.pressure] = m.pressure
  h[H.touch] = m.touch
  h[H.load] = m.shock.load
  h[H.absorbing] = m.shock.absorbing ? 1 : 0
  h[H.shocks] = m.log.length
  h[H.shockQ] = m.log.length ? m.log[m.log.length - 1]!.q : -1
  h[H.rate] = s.rate
  h[H.expected] = f.expected
  h[H.trades] = s.trades
  h[H.shares] = s.shares
  h[H.paths] = stats.paths
  h[H.busy] = stats.busy
  h[H.held] = stats.held
  h[H.speed] = stats.speed
  h[H.fanSeq] = stats.fanSeq
  h[H.paused] = stats.paused ? 1 : 0
  h[H.written] = f.written
  h[H.resets] = stats.resets

  // The book at now.
  const c = Math.round(b.mid)
  h[H.centre] = c
  const lad = v.ladder
  for (let j = 0; j < LEVELS; j++) {
    const price = c - HALF + j
    lad[j] = price <= b.bestBid ? b.bidAt(price) : price >= b.bestAsk ? b.askAt(price) : 0
  }

  // Rows since the page's last frame, as many as the ring still holds.
  const owed = f.written - src.rowsFrom
  const n = Math.max(0, Math.min(owed, ROWS, f.written))
  h[H.nRows] = n
  h[H.lostRows] = Math.max(0, owed - n)
  for (let i = 0; i < n; i++) {
    const r = f.row(n - 1 - i)
    const o = i * ROW_META
    v.rowMeta[o] = f.times[r]!
    v.rowMeta[o + 1] = f.centre[r]!
    v.rowMeta[o + 2] = f.mids[r]!
    v.rowMeta[o + 3] = f.bids[r]!
    v.rowMeta[o + 4] = f.asks[r]!
    v.rowMeta[o + 5] = f.bidQueue[r]!
    v.rowMeta[o + 6] = f.askQueue[r]!
    v.rowMeta[o + 7] = f.events[r]!
    v.rowMeta[o + 8] = m.rowSigma[r]!
    v.rowMeta[o + 9] = m.rowStress[r]!
    v.rows.set(f.queue.subarray(r * LEVELS, (r + 1) * LEVELS), i * PROTOCOL.levels)
  }

  // Trades since then, the newest if there are more than fit.
  const all = src.trades
  const from = Math.max(0, all.length - MAX_TRADES)
  h[H.nTrades] = all.length - from
  h[H.dropped] = from
  for (let i = from; i < all.length; i++) {
    const tr = all[i]!
    const o = (i - from) * 4
    v.trades[o] = tr.t
    v.trades[o + 1] = tr.price
    v.trades[o + 2] = tr.size
    v.trades[o + 3] = tr.side
  }
}
