import { HZ, type Flow } from '@/lib/market/flow'
import { fmt } from './read'
import { rowRise } from './sequence'
import { DX, DZ, REF, VIS, XW, Z_NOW, height } from './view'

/**
 * The figure's direct labels, in one list for the live overlay and the poster,
 * so the crossfade from one to the other moves nothing: what each says, where
 * it is anchored in the world, how far below the anchor it hangs and which
 * way it reads. Most important first; `arrange` (or the live overlay, with
 * `fits`) drops whatever would leave the frame or cover a label placed before
 * it.
 */

export type Anchor = 'c' | 'l' | 'r'
export type LabelKind = 'tag' | 'wall' | 'time' | 'tick'

export interface LabelSpec {
  /** Stable while the label means the same thing, so the live overlay can fade it in and out rather than retext it. */
  id: string
  kind: LabelKind
  text: string
  /** The anchor, in world units. */
  at: [number, number, number]
  /** How far right of and below its anchor the label hangs, in px. */
  dx: number
  dy: number
  anchor: Anchor
}

/** Padding inside each kind of label, px: [x, y]. */
export const PAD: Record<LabelKind, readonly [number, number]> = { tag: [4, 2], wall: [4, 2], time: [2, 0], tick: [2, 0] }

/** The times marked on the history, in seconds ago. */
export const TIMES = [0, 5, 10, 15] as const
/** Price ticks are labelled every 20 ticks ($0.20). */
const STEP = 20
/** The past fades out over the oldest 38% of rows: time is labelled only where the history is drawn in full. */
const SHOWN = 0.62

export function labelSpecs(sim: Flow, o: { centre: number; fracZ: number; narrow: boolean; rows: number; rise?: number }): LabelSpec[] {
  const head = sim.row(0)
  const n = Math.min(o.rows, sim.written)
  const rise = o.rise ?? 1
  const xOf = (price: number) => (price - o.centre) * DX
  const zOf = (age: number) => Z_NOW - (age + o.fracZ) * DZ
  const out: LabelSpec[] = []

  // The price, where the river meets the front row: the visible bottom of the valley, not the floor under it.
  const mid = sim.mids[head]!
  const lo = Math.floor(mid), f = mid - lo
  const yRiver = (height(sim.depthAt(head, lo)) * (1 - f) + height(sim.depthAt(head, lo + 1)) * f) * rowRise(rise, 0, n)
  out.push({ id: 'price', kind: 'tag', text: `Price ${fmt.mid(mid)}`, at: [xOf(mid), yRiver, zOf(0)], dx: 0, dy: 20, anchor: 'c' })

  // Time runs back through the rows. A wide stage shows the whole valley, so it is marked at the buyers' end of
  // each row; a phone crops the valley's ends, so there it is marked on the sellers' wall, just right of the price.
  // Either way the label reads inward from its anchor, onto the wall.
  const time = (i: number) => {
    const s = TIMES[i]!
    const age = s * HZ
    if (age >= n * SHOWN) return
    const edge = o.narrow ? Math.round(VIS * (0.13 + 0.035 * i)) : -(VIS / 2 - 1)
    const price = Math.round(o.centre) + edge
    const y = height(sim.depthAt(sim.row(age), price)) * rowRise(rise, age, n) + 0.02
    out.push({ id: `t${s}`, kind: 'time', text: s === 0 ? 'now' : `${s} s ago`, at: [xOf(price), y, zOf(age)], dx: o.narrow ? 0 : 6, dy: 0, anchor: o.narrow ? 'r' : 'l' })
  }
  time(0)

  // Each wall is named on its face: on a phone near the price, where the frame shows it; on a wider stage half-way
  // out and a few seconds back, clear of the front row's prices and of the time marked at the row ends.
  const wallX = o.narrow ? 0.26 : 0.5
  const wallZ = Z_NOW - (o.narrow ? 0.25 : 0.4)
  const wallY = height(REF * 0.8) + 0.06
  out.push({ id: 'buyers', kind: 'wall', text: 'Buyers waiting', at: [-XW * wallX, wallY, wallZ], dx: 0, dy: 0, anchor: 'c' })
  out.push({ id: 'sellers', kind: 'wall', text: 'Sellers waiting', at: [XW * wallX, wallY, wallZ], dx: 0, dy: 0, anchor: 'c' })
  for (let i = 1; i < TIMES.length; i++) time(i)

  // Price along the front row, every $0.20, except the one the price tag already says.
  const b = Math.floor(o.centre) - VIS / 2
  for (let p = Math.ceil((b + 2) / STEP) * STEP; p <= b + VIS - 2; p += STEP) {
    if (Math.abs(p - mid) < STEP / 2) continue
    out.push({ id: `p${p}`, kind: 'tick', text: fmt.usd(p), at: [xOf(p), height(sim.depthAt(head, p)) * rowRise(rise, 0, n), zOf(0)], dx: 0, dy: 16, anchor: 'c' })
  }
  return out
}

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** A label's box on screen, from the point it hangs at, its size and which way it reads. */
export function boxAt(sx: number, sy: number, w: number, h: number, anchor: Anchor): Box {
  const x0 = anchor === 'c' ? sx - w / 2 : anchor === 'l' ? sx : sx - w
  return { x0, y0: sy - h / 2, x1: x0 + w, y1: sy + h / 2 }
}

/** Room kept around a label, px, so two never touch. */
const GAP = { x: 3, y: 2 }
/** A new label needs this much room from the left and right edges; one already shown keeps its place down to the
 *  smaller margin, so a label near the edge does not flicker as the camera drifts. */
const EDGE = { enter: 8, stay: 2 }

/** Whether a label box may go here: inside the frame, and clear of every box placed before it. */
export function fits(b: Box, placed: readonly Box[], w: number, h: number, shown = false): boolean {
  const m = shown ? EDGE.stay : EDGE.enter
  const x0 = b.x0 - GAP.x, x1 = b.x1 + GAP.x, y0 = b.y0 - GAP.y, y1 = b.y1 + GAP.y
  if (x0 < m || x1 > w - m || y0 < 0 || y1 > h) return false
  return !placed.some((p) => x0 < p.x1 + GAP.x && p.x0 - GAP.x < x1 && y0 < p.y1 + GAP.y && p.y0 - GAP.y < y1)
}

/** Place labels most important first: each gets its box, or null if it would not fit. */
export function arrange(items: readonly { x: number; y: number; w: number; h: number; anchor: Anchor; shown?: boolean }[], w: number, h: number): (Box | null)[] {
  const placed: Box[] = []
  return items.map((it) => {
    const b = boxAt(it.x, it.y, it.w, it.h, it.anchor)
    if (!fits(b, placed, w, h, it.shown)) return null
    placed.push(b)
    return b
  })
}
