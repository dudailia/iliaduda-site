import { HAWKES, MARKET_BUY, MARKET_SELL } from '@/lib/market/flow'
import { AXIS_H, LAM_MID, LANE_H, QUEUE_H, QUEUE_MID, RIGHT, Y, gutter, lamY, laneMid, laneTop, queueY } from '@/lib/orderbook/flowLayout'
import { LANES, SECONDS, type FlowFrame } from '@/lib/orderbook/flowview'

/**
 * Fig. 2, drawn: the same strips as its poster (lib/orderbook/flowPoster.ts),
 * one column to a CSS pixel, and a selected order over them: a hairline at
 * its moment through every strip, a ring on it, and behind it, over each lane
 * whose orders set it off, a wake: as strong as that kind's share of the cause,
 * fading back in time as that kind's excitation decays.
 */

export interface Look {
  ink: string
  paper: string
  graphite: string
  rule: string
  indigo: string
  wash: string
}

export interface Selected {
  /** Seconds before now. */
  ago: number
  lane: number
  /** What set it off, by lane: that kind's share of the cause, and the rate its excitation decays at, per second. */
  wake: { lane: number; p: number; beta: number }[]
}

/** The plot's left edge and width on a stage `w` wide. */
export function plot(w: number) {
  const x0 = gutter(w)
  return { x0, pw: Math.max(1, w - x0 - RIGHT) }
}

/** Opacity of the texture (limit orders and cancels) for one, two, and three or more orders in a column. */
const TEXTURE = [0.18, 0.3, 0.45] as const

export function drawFlow(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, fr: FlowFrame, cols: number, look: Look, sel: Selected | null) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  const { x0, pw } = plot(w)
  const cw = pw / cols
  const xAgo = (ago: number) => x0 + pw * (1 - ago / SECONDS)

  // Behind the selected order's lanes, its wake: a kind's share of the cause lies in that kind's recent orders,
  // weighted by e^(−β·age), so each is shaded back from the order over three decay times (95% of it), as strong as
  // its share, under the marks so none is dimmed.
  if (sel) {
    const sx = xAgo(sel.ago)
    const strongest = sel.wake[0]?.p ?? 1
    for (const k of sel.wake) {
      const back = Math.min(sx - x0, (3 / k.beta / SECONDS) * pw)
      if (back < 1) continue
      const g = ctx.createLinearGradient(sx, 0, sx - back, 0)
      g.addColorStop(0, look.ink)
      g.addColorStop(1, look.ink.replace(')', ' / 0)'))
      ctx.globalAlpha = 0.06 + 0.12 * (k.p / strongest)
      ctx.fillStyle = g
      ctx.fillRect(sx - back, laneTop(k.lane) - 2, back, LANE_H + 4)
    }
    ctx.globalAlpha = 1
  }

  // Orders: limit orders and cancels are the texture, market orders the ink.
  LANES.forEach((type, lane) => {
    const market = type === MARKET_BUY || type === MARKET_SELL
    const y = laneTop(lane)
    ctx.fillStyle = market ? look.ink : look.graphite
    for (let bin = 1; bin <= 3; bin++) {
      ctx.beginPath()
      let any = false
      for (let c = 0; c < cols; ) {
        if (Math.min(3, fr.counts[lane * cols + c]!) !== bin) {
          c++
          continue
        }
        let e = c + 1
        while (e < cols && Math.min(3, fr.counts[lane * cols + e]!) === bin) e++
        ctx.rect(x0 + c * cw, y, (e - c) * cw, LANE_H)
        any = true
        c = e
      }
      if (!any) continue
      ctx.globalAlpha = market ? 1 : TEXTURE[bin - 1]!
      ctx.fill()
    }
  })
  ctx.globalAlpha = 1

  // Intensities, mirrored: μ in gray, the part set off by earlier orders in indigo (the claim), the intensity itself
  // inked.
  fr.lam.forEach((E, d) => {
    const muY = lamY(d, HAWKES.mu[d === 0 ? MARKET_BUY : MARKET_SELL]!)
    ctx.fillStyle = look.rule
    ctx.fillRect(x0, Math.min(LAM_MID, muY), pw, Math.abs(muY - LAM_MID))
    const edge = new Path2D()
    for (let c = 0; c < cols; c++) {
      const x = x0 + (c + 0.5) * cw
      if (c) edge.lineTo(x, lamY(d, E.max[c]!))
      else edge.moveTo(x, lamY(d, E.max[c]!))
      edge.lineTo(x, lamY(d, E.min[c]!))
      edge.lineTo(x, lamY(d, E.last[c]!))
    }
    // The wash: from μ at the left edge along the curve to now, and back along μ.
    const set = new Path2D()
    set.moveTo(x0, muY)
    for (let c = 0; c < cols; c++) {
      const x = x0 + (c + 0.5) * cw
      set.lineTo(x, lamY(d, E.max[c]!))
      set.lineTo(x, lamY(d, E.min[c]!))
      set.lineTo(x, lamY(d, E.last[c]!))
    }
    set.lineTo(x0 + pw, lamY(d, E.last[cols - 1]!))
    set.lineTo(x0 + pw, muY)
    set.closePath()
    // The claim at 3:1 or more against the page (0.35 read 1.3–2.1:1), so it carries without the caption.
    ctx.fillStyle = look.indigo
    ctx.globalAlpha = 0.7
    ctx.fill(set)
    ctx.globalAlpha = 1
    // μ, the rate orders arrive at on their own, as a graphite line: the band under it is context.
    ctx.fillStyle = look.graphite
    ctx.fillRect(x0, Math.round(muY) - 0.5, pw, 1)
    ctx.strokeStyle = look.ink
    ctx.lineWidth = 1
    ctx.lineJoin = 'round'
    ctx.stroke(edge)
  })

  // Queues at the touch: the bid's above the centre line, the ask's below.
  fr.queue.forEach((Q, s) => {
    ctx.beginPath()
    ctx.moveTo(x0, QUEUE_MID)
    for (let c = 0; c < cols; c++) {
      const y = queueY(s as 0 | 1, Q.max[c]!)
      ctx.lineTo(x0 + c * cw, y)
      ctx.lineTo(x0 + (c + 1) * cw, y)
    }
    ctx.lineTo(x0 + pw, QUEUE_MID)
    ctx.closePath()
    ctx.fillStyle = look.rule
    ctx.fill()
    ctx.strokeStyle = look.graphite
    ctx.stroke()
  })

  // Each moment a queue was emptied and the price stepped.
  ctx.beginPath()
  for (const m of fr.emptied) {
    const x = Math.round(x0 + ((m.t - fr.t0) / (fr.t1 - fr.t0)) * pw) + 0.5
    ctx.moveTo(x, QUEUE_MID)
    ctx.lineTo(x, QUEUE_MID + (m.side === 0 ? -1 : 1) * QUEUE_H * 0.46)
  }
  ctx.strokeStyle = look.ink
  ctx.lineWidth = 1.5
  ctx.stroke()

  if (!sel) return
  // The selected event: a hairline at its moment through every strip, and a ring on it.
  const x = Math.round(xAgo(sel.ago)) + 0.5
  const y = laneMid(sel.lane)
  ctx.strokeStyle = look.ink
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.55
  ctx.beginPath()
  ctx.moveTo(x, Y.orders)
  ctx.lineTo(x, Y.axis + AXIS_H * 0.25)
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.beginPath()
  ctx.arc(x, y, 5, 0, Math.PI * 2)
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.globalAlpha = 1
}
