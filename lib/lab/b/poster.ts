import { HZ, TICK, type Sim } from './sim'
import { DX, DZ, REF, REST, VIS, XW, Z_NOW, fit, height, lens, mul, perspective, toScreen, view } from './view'

/**
 * The poster: the same frame the live renderer will draw first, projected
 * through the same camera, as ridgelines — each kept snapshot a line of depth
 * across price, filled with paper so nearer rows hide farther ones. Integer
 * coordinates and relative path commands keep it small, because the HTML is
 * sent twice (the document and the RSC payload).
 */

export interface PosterRow {
  bid: { d: string; dash: string }
  ask: { d: string; dash: string }
  /** 0 (far) … 1 (now): fades the far rows into the paper. */
  near: number
}

export interface PosterGeometry {
  w: number
  h: number
  rows: PosterRow[]
  river: string
  dots: [number, number, number][]
  /** Projected positions for the in-scene labels. */
  labels: { price: [number, number, string][]; buyers: [number, number]; sellers: [number, number]; now: [number, number] | null; mid: [number, number] | null; midText: string }
}

/**
 * One ridgeline as a closed path, and a dash pattern that strokes only its
 * top: the closure along the floor fills (hiding the rows behind) but is
 * never drawn. The lengths are exact, because every segment is straight.
 */
function path(pts: [number, number][], floor: [number, number][]): { d: string; dash: string } {
  if (pts.length < 2) return { d: '', dash: '' }
  let d = `M${pts[0]![0]} ${pts[0]![1]}`
  let [px, py] = pts[0]!
  let len = 0
  const rel = ([x, y]: [number, number]) => {
    const s = `l${x - px} ${y - py}`
    len += Math.hypot(x - px, y - py)
    px = x
    py = y
    return s
  }
  for (let i = 1; i < pts.length; i++) d += rel(pts[i]!)
  const top = len
  // The floor under a row is a straight line in the world, so it projects to
  // one: its two ends are enough.
  if (floor.length) {
    d += rel(floor[floor.length - 1]!)
    d += rel(floor[0]!)
  }
  len += Math.hypot(pts[0]![0] - px, pts[0]![1] - py)
  return { d: d + 'z', dash: `${top.toFixed(1)} ${(len - top + 2).toFixed(0)}` }
}

export function posterGeometry(sim: Sim, w: number, h: number, opts: { every: number; step: number }): PosterGeometry {
  const aspect = w / h
  const cam = fit(REST.yaw, REST.pitch, aspect)
  const m = mul(perspective(aspect, lens(aspect)), view(cam))
  const P = (x: number, y: number, z: number): [number, number] | null => {
    const s = toScreen(m, w, h, x, y, z)
    return s ? [Math.round(s[0]), Math.round(s[1])] : null
  }
  const head = sim.row(0)
  const centre = sim.mids[head]!
  const frac = (sim.t - sim.times[head]!) * HZ
  const base = Math.floor(centre) - VIS / 2
  const fx = centre - Math.floor(centre)
  const rows: PosterRow[] = []
  const narrow = aspect < 1
  const reach = Math.round(narrow ? VIS * 0.36 : VIS / 2)
  const maxAge = Math.min(sim.written, narrow ? 150 : 220)
  for (let age = maxAge - 1 - ((maxAge - 1) % opts.every); age >= 0; age -= opts.every) {
    const r = sim.row(age)
    const z = Z_NOW - (age + frac) * DZ
    const bid: [number, number][] = [], ask: [number, number][] = []
    const bidFloor: [number, number][] = [], askFloor: [number, number][] = []
    const bb = sim.bids[r]!, ba = sim.asks[r]!
    for (let j = VIS / 2 - reach; j <= VIS / 2 + reach; j++) {
      const price = base + j
      const onGrid = (j - (VIS / 2 - reach)) % opts.step === 0
      const isTouch = price === bb || price === ba
      if (!onGrid && !isTouch) continue
      const x = (j - VIS / 2 - fx) * DX
      if (Math.abs(x) > XW) continue
      const y = height(sim.depthAt(r, price))
      const top = P(x, y, z), bottom = P(x, 0, z)
      if (!top || !bottom) continue
      if (price <= bb) {
        bid.push(top)
        bidFloor.push(bottom)
      }
      if (price >= ba) {
        ask.push(top)
        askFloor.push(bottom)
      }
    }
    // The valley floor between the touches joins the two halves.
    const midX = (sim.mids[r]! - centre) * DX
    const floorMid = P(midX, 0, z)
    if (floorMid) {
      bid.push(floorMid)
      bidFloor.push(floorMid)
      ask.unshift(floorMid)
      askFloor.unshift(floorMid)
    }
    rows.push({ bid: path(bid, bidFloor), ask: path(ask, askFloor), near: 1 - age / maxAge })
  }

  let river = ''
  let last: [number, number] | null = null
  for (let age = maxAge - 1; age >= 0; age -= 2) {
    const r = sim.row(age)
    const p = P((sim.mids[r]! - centre) * DX, 0.004, Z_NOW - (age + frac) * DZ)
    if (!p) continue
    river += last ? `l${p[0] - last[0]} ${p[1] - last[1]}` : `M${p[0]} ${p[1]}`
    last = p
  }

  const dots: [number, number, number][] = []
  const tHead = sim.times[head]!
  for (const tr of sim.trades) {
    const age = (tHead - tr.t) * HZ
    if (age < 0 || age > maxAge - 1) continue
    const x = (tr.price - centre) * DX
    if (Math.abs(x) > XW * (narrow ? 0.72 : 1)) continue
    const r = sim.row(Math.round(age))
    const p = P(x, height(sim.depthAt(r, tr.price)) + 0.01, Z_NOW - (age + frac) * DZ)
    if (p) dots.push([p[0], p[1], Math.round(Math.min(5, 1.6 + Math.sqrt(tr.size) * 0.7) * 10) / 10])
  }

  const price: [number, number, string][] = []
  const stepTicks = 20
  for (let p = Math.ceil((base + VIS / 2 - reach) / stepTicks) * stepTicks; p <= base + VIS / 2 + reach; p += stepTicks) {
    const s = P((p - centre) * DX, height(sim.depthAt(head, p)), Z_NOW - frac * DZ)
    if (s && s[0] > 30 && s[0] < w - 30) price.push([s[0], s[1] + 16, `$${(p * TICK).toFixed(2)}`])
  }
  const wallX = narrow ? 0.26 : 0.8
  const wallY = height(REF * 0.8) + 0.06
  return {
    w,
    h,
    rows,
    river,
    dots,
    labels: {
      price,
      buyers: P(-XW * wallX, wallY, Z_NOW - 0.25) ?? [0, 0],
      sellers: P(XW * wallX, wallY, Z_NOW - 0.25) ?? [0, 0],
      now: (() => {
        const edge = narrow ? Math.round(VIS * 0.13) : VIS / 2 - 1
        return P(edge * DX + 0.04, height(sim.depthAt(head, Math.round(centre) + edge)) + 0.02, Z_NOW - frac * DZ)
      })(),
      mid: P(0, 0, Z_NOW - frac * DZ),
      midText: `Price $${(centre * TICK).toFixed(2)}`,
    },
  }
}

