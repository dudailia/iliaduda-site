import { HZ, type Flow } from '@/lib/market/flow'
import { PAD, arrange, labelSpecs, type Box, type LabelKind } from './labels'
import { DX, DZ, HISTORY, REST, VIS, XW, Z_NOW, fit, height, lens, mul, perspective, restPitch, toScreen, view, type Camera } from './view'

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
  /** 0 (far) … 1 (now): how strongly the ridge's top is drawn. */
  near: number
  /** 0 … 1: how far the row has faded into the past, as the live shader fades it (smoothstep over its history). */
  fade: number
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export interface PosterGeometry {
  w: number
  h: number
  rows: PosterRow[]
  river: string
  /** Recent trades: x, y, radius, and opacity (the older, the fainter, as the live dots fade). */
  dots: [number, number, number, number][]
  /** The live overlay's labels for this frame, placed by its rules (lib/orderbook/labels.ts). */
  labels: PosterLabel[]
}

export interface PosterLabel extends Box {
  text: string
  kind: LabelKind
}

/** The overlay's label size (text-meta, 13px), so the poster's labels are the live ones. Mono: 0.6em a character. */
export const LABEL_FS = 13

/**
 * The part of a polyline between x = lo and x = hi, cut where it crosses an
 * edge: the frame crops the poster as the canvas crops the live figure, so
 * nothing is authored outside the viewBox (and the points past it are not sent).
 */
function cropX(pts: [number, number][], lo: number, hi: number): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    if (i > 0) {
      const q = pts[i - 1]!
      const cuts = [lo, hi]
        .filter((e) => (q[0] - e) * (p[0] - e) < 0)
        .map((e) => [e, (e - q[0]) / (p[0] - q[0])] as const)
        .sort((a, b) => a[1] - b[1])
      for (const [e, t] of cuts) out.push([e, Math.round(q[1] + (p[1] - q[1]) * t)])
    }
    if (p[0] >= lo && p[0] <= hi) out.push(p)
  }
  return out
}

/**
 * One ridgeline as a closed path, and a dash pattern that strokes only its
 * top: the closure along the floor fills (hiding the rows behind) but is
 * never drawn. The lengths are exact, because every segment is straight.
 */
function path(ridge: [number, number][], ground: [number, number][], w: number): { d: string; dash: string } {
  const pts = cropX(ridge, 0, w)
  // The floor under a row is a straight line in the world, so it projects to
  // one: its two ends are enough, cropped like the ridge.
  const floor = ground.length ? cropX([ground[0]!, ground[ground.length - 1]!], 0, w) : []
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
  if (floor.length) {
    d += rel(floor[floor.length - 1]!)
    d += rel(floor[0]!)
  }
  len += Math.hypot(pts[0]![0] - px, pts[0]![1] - py)
  return { d: d + 'z', dash: `${top.toFixed(1)} ${(len - top + 2).toFixed(0)}` }
}

/** The poster's two arrangements: a laptop's column (646×576 at 1440×900) and a phone's full-bleed frame (390×591). */
export const POSTERS = [
  { variant: 'wide', w: 646, h: 576, opts: { every: 6, step: 2 } },
  { variant: 'narrow', w: 390, h: 591, opts: { every: 7, step: 2 } },
] as const
export type Variant = (typeof POSTERS)[number]['variant']

/** The poster for one arrangement. */
export function posterOf(sim: Flow, variant: Variant): PosterGeometry {
  const p = POSTERS.find((x) => x.variant === variant)!
  return posterGeometry(sim, p.w, p.h, p.opts)
}

export function posterGeometry(sim: Flow, w: number, h: number, opts: { every: number; step: number }, camera?: Camera): PosterGeometry {
  const aspect = w / h
  const cam = camera ?? fit(REST.yaw, restPitch(aspect), aspect)
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
    rows.push({ bid: path(bid, bidFloor, w), ask: path(ask, askFloor, w), near: 1 - age / maxAge, fade: Math.round(smooth(0.4, 1, (age + frac) / HISTORY) * 100) / 100 })
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

  const dots: [number, number, number, number][] = []
  const tHead = sim.times[head]!
  for (const tr of sim.trades) {
    const age = (tHead - tr.t) * HZ
    if (age < 0 || age > maxAge - 1) continue
    const x = (tr.price - centre) * DX
    if (Math.abs(x) > XW * (narrow ? 0.72 : 1)) continue
    const r = sim.row(Math.round(age))
    const p = P(x, height(sim.depthAt(r, tr.price)) + 0.01, Z_NOW - (age + frac) * DZ)
    // The live point is 3 + 0.6√size px across, and fades over the older part of the history.
    const rad = Math.round((1.5 + 0.3 * Math.sqrt(tr.size)) * 10) / 10
    const a = 1 - smooth(0.4, 1, age / HISTORY)
    if (p && a > 0.12 && p[0] - rad >= 0 && p[0] + rad <= w && p[1] - rad >= 0 && p[1] + rad <= h) dots.push([p[0], p[1], rad, a])
  }

  // The labels the first live frame would place, in the order it places them.
  const items = labelSpecs(sim, { centre, fracZ: frac, narrow, rows: HISTORY }).flatMap((l) => {
    const at = toScreen(m, w, h, l.at[0], l.at[1], l.at[2])
    if (!at) return []
    const [px, py] = PAD[l.kind]
    return [{ l, x: at[0] + l.dx, y: at[1] + l.dy, w: l.text.length * LABEL_FS * 0.6 + 2 * px, h: LABEL_FS + 2 * py, anchor: l.anchor }]
  })
  const r1 = (v: number) => Math.round(v * 10) / 10
  const labels = arrange(items, w, h).flatMap((b, i) =>
    b ? [{ x0: r1(b.x0), y0: r1(b.y0), x1: r1(b.x1), y1: r1(b.y1), text: items[i]!.l.text, kind: items[i]!.l.kind }] : [],
  )
  return {
    w,
    h,
    rows,
    river,
    dots,
    labels,
  }
}

